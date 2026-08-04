// FairPOS TSE CLI — minimal wrapper around the Swissbit WormAPI.
//
// This is an independent, from-scratch implementation (not derived from
// Swissbit's own `wormCli` example) written specifically for FairPOS's needs.
// It intentionally supports only the commands FairPOS actually uses — see
// docs/TSE-Integration.md for the full rationale and the command contract.
//
// Design rules that keep this file small and easy to maintain:
//   - No JSON library dependency. Every value we print is either a fixed
//     string, a decimal number, or a hex-encoded byte string — none of that
//     needs escaping, so a hand-rolled printer is enough.
//   - Every command prints exactly one JSON object to stdout and sets the
//     process exit code (0 = success, 1 = failure). Callers (see
//     packages/backend/src/tse/client.ts) never need to parse human-readable
//     text.
//   - No autopilot, no LAN-TSE support, no firmware update, no multi-client
//     management — FairPOS has exactly one registered client and manages the
//     TSE lifecycle explicitly from the Node.js side (see queue.ts).

#include <WormDLL/WormDLL.h>

#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <ctime>
#include <string>
#include <vector>

namespace {

// -- tiny output helpers -----------------------------------------------------

/** Hex-encodes a byte buffer (lowercase, no separators). */
std::string toHex(const unsigned char *data, size_t len) {
  static const char *digits = "0123456789abcdef";
  std::string out;
  out.reserve(len * 2);
  for (size_t i = 0; i < len; i++) {
    out.push_back(digits[data[i] >> 4]);
    out.push_back(digits[data[i] & 0x0f]);
  }
  return out;
}

/** Prints `{"ok":false,"error":{"code":<n>,"message":"<msg>"}}` and returns 1. */
int printError(WormError err, const char *message) {
  std::printf("{\"ok\":false,\"error\":{\"code\":%d,\"message\":\"%s\"}}\n",
              (int)err, message);
  return 1;
}

/** Prints a one-line usage error (invalid CLI arguments, not a WormError). */
int printUsageError(const char *message) {
  std::printf("{\"ok\":false,\"error\":{\"code\":-1,\"message\":\"%s\"}}\n",
              message);
  return 1;
}

/** Minimal Base64 decoder. processData may contain arbitrary bytes, so the
 * Node side always base64-encodes it before passing it as a CLI argument —
 * this avoids any shell-escaping concerns for binary payloads. */
std::vector<unsigned char> base64Decode(const std::string &in) {
  static const std::string alphabet =
      "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  std::vector<int> table(256, -1);
  for (size_t i = 0; i < alphabet.size(); i++) table[(unsigned char)alphabet[i]] = (int)i;

  std::vector<unsigned char> out;
  int val = 0, bits = -8;
  for (unsigned char c : in) {
    if (c == '=') break;
    int d = table[c];
    if (d == -1) continue;  // skip whitespace/newlines
    val = (val << 6) + d;
    bits += 6;
    if (bits >= 0) {
      out.push_back((unsigned char)((val >> bits) & 0xff));
      bits -= 8;
    }
  }
  return out;
}

/** Prints the JSON result shared by start/update/finish. */
void printTransactionResult(const WormTransactionResponse *rsp) {
  const unsigned char *signature;
  worm_uint signatureLength;
  worm_transaction_response_signature(rsp, &signature, &signatureLength);
  const unsigned char *serial;
  worm_uint serialLength;
  worm_transaction_response_serialNumber(rsp, &serial, &serialLength);

  std::printf(
      "{\"ok\":true,\"result\":{"
      "\"transactionNumber\":%llu,"
      "\"signatureCounter\":%llu,"
      "\"logTime\":%llu,"
      "\"signature\":\"%s\","
      "\"serialNumber\":\"%s\""
      "}}\n",
      (unsigned long long)worm_transaction_response_transactionNumber(rsp),
      (unsigned long long)worm_transaction_response_signatureCounter(rsp),
      (unsigned long long)worm_transaction_response_logTime(rsp),
      toHex(signature, signatureLength).c_str(),
      toHex(serial, serialLength).c_str());
}

// -- command handlers ---------------------------------------------------------

/** `setup <clientId> <credentialSeed> <adminPuk> <adminPin> <timeAdminPin>`
 * One-time provisioning of a fresh TSE. Fails on purpose if the TSE was
 * already set up — re-running setup on a live TSE is an operator error we
 * want surfaced, not silently handled. Use `maintain` for routine upkeep. */
int cmdSetup(WormContext *ctx, int argc, char **argv) {
  if (argc != 5) return printUsageError("setup needs 5 arguments");
  std::string clientId(argv[0]), credentialSeed(argv[1]), adminPuk(argv[2]),
      adminPin(argv[3]), timeAdminPin(argv[4]);

  int needsSetup = 0;
  WormError err = worm_tse_needs_setup(ctx, &needsSetup);
  if (err != WORM_ERROR_NOERROR) return printError(err, "worm_tse_needs_setup failed");
  if (!needsSetup) return printError(WORM_ERROR_INVALID_STATE, "TSE is already set up");

  err = worm_tse_setup_ext(
      ctx, (const unsigned char *)credentialSeed.data(), (int)credentialSeed.size(),
      (const unsigned char *)adminPuk.data(), (int)adminPuk.size(),
      (const unsigned char *)adminPin.data(), (int)adminPin.size(),
      (const unsigned char *)timeAdminPin.data(), (int)timeAdminPin.size(),
      clientId.c_str(), /*enableAutopilot=*/0);
  if (err != WORM_ERROR_NOERROR) return printError(err, "worm_tse_setup_ext failed");

  std::printf("{\"ok\":true,\"result\":{}}\n");
  return 0;
}

/** `maintain <clientId> <timeAdminPin>`
 * Routine upkeep: self test + time sync. Meant to be called periodically
 * (e.g. every few hours) by a scheduler in the Node.js backend — see
 * docs/TSE-Integration.md section 6. Uses the TimeAdmin PIN only, which is
 * the one credential FairPOS is allowed to store persistently. */
int cmdMaintain(WormContext *ctx, int argc, char **argv) {
  if (argc != 2) return printUsageError("maintain needs 2 arguments");
  std::string clientId(argv[0]), timeAdminPin(argv[1]);

  // Self test must run before login/updateTime — it invalidates the TSE's
  // notion of time, which we then have to set again below.
  WormError err = worm_tse_runSelfTest(ctx, clientId.c_str());
  if (err != WORM_ERROR_NOERROR) return printError(err, "worm_tse_runSelfTest failed");

  int retries = 0;
  err = worm_user_login(ctx, WORM_USER_TIME_ADMIN,
                        (const unsigned char *)timeAdminPin.data(),
                        (int)timeAdminPin.size(), &retries);
  if (err != WORM_ERROR_NOERROR) return printError(err, "TimeAdmin login failed");

  err = worm_tse_updateTime(ctx, (worm_uint)time(nullptr));
  worm_user_logout(ctx, WORM_USER_TIME_ADMIN);  // best-effort, ignore result
  if (err != WORM_ERROR_NOERROR) return printError(err, "worm_tse_updateTime failed");

  std::printf("{\"ok\":true,\"result\":{}}\n");
  return 0;
}

/** `start <clientId> <processType> <processDataBase64>` */
int cmdStart(WormContext *ctx, int argc, char **argv) {
  if (argc != 3) return printUsageError("start needs 3 arguments");
  std::string clientId(argv[0]), processType(argv[1]);
  std::vector<unsigned char> data = base64Decode(argv[2]);

  WormTransactionResponse *rsp = worm_transaction_response_new(ctx);
  WormError err = worm_transaction_start(ctx, clientId.c_str(), data.data(),
                                         (worm_uint)data.size(),
                                         processType.c_str(), rsp);
  if (err == WORM_ERROR_NOERROR) printTransactionResult(rsp);
  worm_transaction_response_free(rsp);
  return err == WORM_ERROR_NOERROR ? 0 : printError(err, "worm_transaction_start failed");
}

/** `update <clientId> <transactionNumber> <processType> <processDataBase64>` */
int cmdUpdate(WormContext *ctx, int argc, char **argv) {
  if (argc != 4) return printUsageError("update needs 4 arguments");
  std::string clientId(argv[0]);
  worm_uint trNumber = (worm_uint)std::strtoull(argv[1], nullptr, 10);
  std::string processType(argv[2]);
  std::vector<unsigned char> data = base64Decode(argv[3]);

  WormTransactionResponse *rsp = worm_transaction_response_new(ctx);
  WormError err = worm_transaction_update(ctx, clientId.c_str(), trNumber,
                                          data.data(), (worm_uint)data.size(),
                                          processType.c_str(), rsp);
  if (err == WORM_ERROR_NOERROR) printTransactionResult(rsp);
  worm_transaction_response_free(rsp);
  return err == WORM_ERROR_NOERROR ? 0 : printError(err, "worm_transaction_update failed");
}

/** `finish <clientId> <transactionNumber> <processType> <processDataBase64>` */
int cmdFinish(WormContext *ctx, int argc, char **argv) {
  if (argc != 4) return printUsageError("finish needs 4 arguments");
  std::string clientId(argv[0]);
  worm_uint trNumber = (worm_uint)std::strtoull(argv[1], nullptr, 10);
  std::string processType(argv[2]);
  std::vector<unsigned char> data = base64Decode(argv[3]);

  WormTransactionResponse *rsp = worm_transaction_response_new(ctx);
  WormError err = worm_transaction_finish(ctx, clientId.c_str(), trNumber,
                                          data.data(), (worm_uint)data.size(),
                                          processType.c_str(), rsp);
  if (err == WORM_ERROR_NOERROR) printTransactionResult(rsp);
  worm_transaction_response_free(rsp);
  return err == WORM_ERROR_NOERROR ? 0 : printError(err, "worm_transaction_finish failed");
}

/** `info` — TSE status snapshot for the admin UI / health checks. */
int cmdInfo(WormContext *ctx) {
  WormInfo *info = worm_info_new(ctx);
  if (info == nullptr) return printError(WORM_ERROR_OUTOFMEM, "worm_info_new failed");
  WormError err = worm_info_read(info);
  if (err != WORM_ERROR_NOERROR) {
    worm_info_free(info);
    return printError(err, "worm_info_read failed");
  }

  const unsigned char *serial;
  worm_uint serialLength;
  worm_info_tseSerialNumber(info, &serial, &serialLength);

  std::printf(
      "{\"ok\":true,\"result\":{"
      "\"hasPassedSelfTest\":%s,"
      "\"hasValidTime\":%s,"
      "\"startedTransactions\":%u,"
      "\"maxStartedTransactions\":%u,"
      "\"remainingSignatures\":%u,"
      "\"maxSignatures\":%u,"
      "\"certificateExpirationDate\":%llu,"
      "\"timeUntilNextSelfTest\":%u,"
      "\"timeUntilNextTimeSynchronization\":%u,"
      "\"tseCertificationId\":\"%s\","
      "\"formFactor\":\"%s\","
      "\"tseSerialNumber\":\"%s\""
      "}}\n",
      worm_info_hasPassedSelfTest(info) ? "true" : "false",
      worm_info_hasValidTime(info) ? "true" : "false",
      worm_info_startedTransactions(info), worm_info_maxStartedTransactions(info),
      worm_info_remainingSignatures(info), worm_info_maxSignatures(info),
      (unsigned long long)worm_info_certificateExpirationDate(info),
      worm_info_timeUntilNextSelfTest(info),
      worm_info_timeUntilNextTimeSynchronization(info),
      worm_info_tseCertificationId(info), worm_info_formFactor(info),
      toHex(serial, serialLength).c_str());

  worm_info_free(info);
  return 0;
}

/** `exportTar <outputFile>` — raw TR-03153 archive, consumed by the backup
 * job / DSFinV-K pipeline (task #13), not parsed here. */
int fileWriteCallback(const unsigned char *chunk, unsigned int chunkLength,
                      void *callbackData) {
  std::FILE *f = (std::FILE *)callbackData;
  size_t written = std::fwrite(chunk, 1, chunkLength, f);
  return written == chunkLength ? 0 : 1;
}

int cmdExportTar(WormContext *ctx, int argc, char **argv) {
  if (argc != 1) return printUsageError("exportTar needs 1 argument");
  std::FILE *f = std::fopen(argv[0], "wb");
  if (f == nullptr) return printUsageError("failed to open output file");

  WormError err = worm_export_tar(ctx, fileWriteCallback, f);
  std::fclose(f);
  if (err != WORM_ERROR_NOERROR) return printError(err, "worm_export_tar failed");

  std::printf("{\"ok\":true,\"result\":{}}\n");
  return 0;
}

}  // namespace

int main(int argc, char **argv) {
  if (argc < 3) {
    return printUsageError(
        "usage: tseCli <mountPoint> <setup|maintain|start|update|finish|info|exportTar> [args...]");
  }
  const char *mountPoint = argv[1];
  std::string command(argv[2]);
  char **cmdArgs = argv + 3;
  int cmdArgc = argc - 3;

  WormContext *ctx = nullptr;
  WormError err = worm_init(&ctx, mountPoint);
  if (err != WORM_ERROR_NOERROR) return printError(err, "worm_init failed");

  int exitCode;
  if (command == "setup") exitCode = cmdSetup(ctx, cmdArgc, cmdArgs);
  else if (command == "maintain") exitCode = cmdMaintain(ctx, cmdArgc, cmdArgs);
  else if (command == "start") exitCode = cmdStart(ctx, cmdArgc, cmdArgs);
  else if (command == "update") exitCode = cmdUpdate(ctx, cmdArgc, cmdArgs);
  else if (command == "finish") exitCode = cmdFinish(ctx, cmdArgc, cmdArgs);
  else if (command == "info") exitCode = cmdInfo(ctx);
  else if (command == "exportTar") exitCode = cmdExportTar(ctx, cmdArgc, cmdArgs);
  else exitCode = printUsageError("unknown command");

  worm_cleanup(ctx);
  return exitCode;
}
