/**
 * Pure helpers for the Bonkasse order list.
 * Article entries carry the data needed to compute totals and render the list;
 * keeping the type minimal makes the helpers easy to test without a full Article fixture.
 */

/** Minimal article shape consumed by the order helpers. */
export interface ArticleLike {
  id: string;
  name: string;
  price: number | string;
  deposit_price: number | string | null;
}

/** One line in the current order — an article reference with a quantity. */
export interface OrderLine {
  article_id: string;
  quantity: number;
}

/** Coerces a value that may be a pg-decimal string into a number. */
export function num(v: number | string | null | undefined): number {
  if (v === null || v === undefined) return 0;
  return typeof v === 'string' ? Number(v) : v;
}

/** Adjusts the quantity for an article in the order list. Removes the line when quantity reaches 0. Pure. */
export function adjustQuantity(lines: OrderLine[], articleId: string, delta: number): OrderLine[] {
  const existing = lines.find((l) => l.article_id === articleId);
  if (!existing) {
    if (delta <= 0) return lines;
    return [...lines, { article_id: articleId, quantity: delta }];
  }
  const next = existing.quantity + delta;
  if (next <= 0) return lines.filter((l) => l.article_id !== articleId);
  return lines.map((l) => (l.article_id === articleId ? { ...l, quantity: next } : l));
}

/** Sets the quantity for an article in the order list to an absolute value. Removes when 0. Pure. */
export function setQuantity(lines: OrderLine[], articleId: string, quantity: number): OrderLine[] {
  if (quantity <= 0) return lines.filter((l) => l.article_id !== articleId);
  const existing = lines.find((l) => l.article_id === articleId);
  if (!existing) return [...lines, { article_id: articleId, quantity }];
  return lines.map((l) => (l.article_id === articleId ? { ...l, quantity } : l));
}

/** Computes the gross total for the current order. Includes deposit per unit. Cent-precise rounding. */
export function computeOrderTotal(lines: OrderLine[], articles: ArticleLike[]): number {
  const byId = new Map(articles.map((a) => [a.id, a]));
  let total = 0;
  for (const line of lines) {
    const article = byId.get(line.article_id);
    if (!article) continue;
    const unit = num(article.price) + num(article.deposit_price);
    total += unit * line.quantity;
  }
  return Math.round(total * 100) / 100;
}
