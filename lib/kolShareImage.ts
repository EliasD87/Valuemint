/**
 * The KOL envelope as a picture, for pasting into a post.
 *
 * X's share link can carry text and a URL but never an image, so the claim
 * dialog offers this instead: copy the envelope, open the post, paste. It is
 * drawn on a canvas rather than screenshotted from the DOM — no dependency,
 * and the result is the same crisp 1200px square on every screen.
 *
 * Colours are read from the dialog's own --env-* tokens, so the picture
 * matches the theme the person is looking at. The portrait is the local
 * mirror (same origin), which keeps the canvas untainted and exportable.
 */

export interface ShareImageInput {
  /** The element the --env-* tokens are read from (the dialog). */
  themeFrom: Element;
  portrait: string;
  number: number;
  name: string;
  handle?: string;
  /** The display face as the page resolved it, so the canvas draws in it. */
  displayFont: string;
  sansFont: string;
}

const W = 1200;
const H = 1200;

export async function renderKolShareImage(input: ShareImageInput): Promise<Blob> {
  const css = getComputedStyle(input.themeFrom);
  const t = (name: string) => css.getPropertyValue(name).trim();
  const c = {
    stage: t("--env-stage"),
    back: t("--env-back"),
    front: t("--env-front"),
    front2: t("--env-front-2"),
    ink: t("--env-ink"),
    ink2: t("--env-ink-2"),
    glow: t("--env-glow"),
    glow2: t("--env-glow-2"),
    cardA: t("--env-card-a"),
    cardB: t("--env-card-b"),
    accent: t("--accent"),
    white: t("--dark-ink"),
  };

  const img = new Image();
  img.src = input.portrait;
  await img.decode();

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const g = canvas.getContext("2d")!;
  const spaced = (px: number) => {
    // Tracking where the browser supports it; plain text where it does not.
    if ("letterSpacing" in g) (g as unknown as { letterSpacing: string }).letterSpacing = `${px}px`;
  };

  // Ground and the light inside the envelope.
  g.fillStyle = c.stage;
  g.fillRect(0, 0, W, H);
  const glow = g.createRadialGradient(600, 600, 40, 600, 600, 560);
  glow.addColorStop(0, c.glow);
  glow.addColorStop(0.55, c.glow2);
  glow.addColorStop(1, "transparent");
  g.fillStyle = glow;
  g.fillRect(0, 0, W, H);

  // One line above the envelope: who it is from.
  g.textAlign = "center";
  g.textBaseline = "alphabetic";
  g.fillStyle = c.accent;
  g.font = `700 26px ${input.sansFont}`;
  spaced(6);
  g.fillText("A GIFT FROM VALUECHAIN", W / 2, 150);

  // Envelope body, and the open flap standing behind the card.
  const ex = 190;
  const ew = 820;
  const ey = 640;
  const eh = 470;
  g.fillStyle = c.back;
  g.beginPath();
  g.roundRect(ex, ey, ew, eh, 18);
  g.fill();
  g.globalAlpha = 0.92;
  g.fillStyle = c.front2;
  g.beginPath();
  g.moveTo(ex, ey + 1);
  g.lineTo(W / 2, ey - 290);
  g.lineTo(ex + ew, ey + 1);
  g.closePath();
  g.fill();
  g.globalAlpha = 1;

  // The card: warm gradient, corner ticks, the portrait, the caption.
  const cx = 290;
  const cw = 620;
  const pad = 30;
  const art = cw - pad * 2;
  const ch = pad + 54 + art + 70;
  const cy = ey + eh * 0.8 - ch;
  g.save();
  g.shadowColor = c.glow;
  g.shadowBlur = 60;
  g.shadowOffsetY = 20;
  const card = g.createLinearGradient(0, cy, 0, cy + ch);
  card.addColorStop(0, c.cardA);
  card.addColorStop(1, c.cardB);
  g.fillStyle = card;
  g.beginPath();
  g.roundRect(cx, cy, cw, ch, 22);
  g.fill();
  g.restore();

  g.strokeStyle = c.white;
  g.globalAlpha = 0.55;
  g.lineWidth = 3;
  g.beginPath();
  g.moveTo(cx + 16, cy + 36);
  g.lineTo(cx + 16, cy + 16);
  g.lineTo(cx + 36, cy + 16);
  g.moveTo(cx + cw - 36, cy + 16);
  g.lineTo(cx + cw - 16, cy + 16);
  g.lineTo(cx + cw - 16, cy + 36);
  g.stroke();
  g.globalAlpha = 1;

  g.fillStyle = c.white;
  g.font = `700 20px ${input.sansFont}`;
  spaced(3.5);
  g.textAlign = "left";
  g.fillText("VALUEMINT KOLS", cx + pad + 6, cy + pad + 30);
  g.textAlign = "right";
  g.fillText(`#${String(input.number).padStart(2, "0")}`, cx + cw - pad - 6, cy + pad + 30);

  g.save();
  g.beginPath();
  g.roundRect(cx + pad, cy + pad + 54, art, art, 12);
  g.clip();
  g.drawImage(img, cx + pad, cy + pad + 54, art, art);
  g.restore();

  // The pocket in front, with the bottom flap folded over it.
  const pocket = new Path2D();
  pocket.moveTo(ex, ey + eh * 0.12);
  pocket.lineTo(ex + ew * 0.34, ey + eh * 0.5);
  pocket.lineTo(ex + ew * 0.66, ey + eh * 0.5);
  pocket.lineTo(ex + ew, ey + eh * 0.12);
  pocket.lineTo(ex + ew, ey + eh - 18);
  pocket.quadraticCurveTo(ex + ew, ey + eh, ex + ew - 18, ey + eh);
  pocket.lineTo(ex + 18, ey + eh);
  pocket.quadraticCurveTo(ex, ey + eh, ex, ey + eh - 18);
  pocket.closePath();
  g.save();
  g.shadowColor = "rgba(0, 0, 0, 0.22)";
  g.shadowBlur = 24;
  g.shadowOffsetY = -8;
  g.fillStyle = c.front;
  g.fill(pocket);
  g.restore();
  const fold = g.createLinearGradient(0, ey + eh * 0.46, 0, ey + eh);
  fold.addColorStop(0, c.front);
  fold.addColorStop(1, c.front2);
  g.fillStyle = fold;
  g.beginPath();
  g.moveTo(ex + 10, ey + eh);
  g.lineTo(W / 2, ey + eh * 0.46);
  g.lineTo(ex + ew - 10, ey + eh);
  g.closePath();
  g.fill();

  // Addressed, like the one on screen.
  const line = (label: string, name: string, extra: string | undefined, y: number, brand: boolean) => {
    g.font = `700 17px ${input.sansFont}`;
    spaced(3.5);
    const lw = g.measureText(label).width;
    g.font = `800 32px ${input.displayFont}`;
    spaced(-0.5);
    const nw = g.measureText(name).width;
    g.font = `500 24px ${input.sansFont}`;
    spaced(0);
    const xw = extra === undefined ? 0 : g.measureText(extra).width + 14;
    let x = W / 2 - (lw + 14 + nw + xw) / 2;
    g.textAlign = "left";
    g.fillStyle = c.ink2;
    g.font = `700 17px ${input.sansFont}`;
    spaced(3.5);
    g.fillText(label, x, y);
    x += lw + 14;
    g.font = `800 32px ${input.displayFont}`;
    spaced(-0.5);
    if (brand) {
      const b = g.createLinearGradient(x, 0, x + nw, 0);
      b.addColorStop(0, c.cardA);
      b.addColorStop(1, c.cardB);
      g.fillStyle = b;
    } else {
      g.fillStyle = c.ink;
    }
    g.fillText(name, x, y);
    if (extra !== undefined) {
      x += nw + 14;
      g.fillStyle = c.ink2;
      g.font = `500 24px ${input.sansFont}`;
      spaced(0);
      g.fillText(extra, x, y);
    }
  };
  line("FROM", "ValueChain", undefined, ey + eh - 96, true);
  line("TO", input.name, input.handle, ey + eh - 46, false);

  // Signature line.
  g.textAlign = "left";
  g.fillStyle = c.ink2;
  g.font = `600 22px ${input.sansFont}`;
  spaced(0);
  g.fillText("valuemint.store/kols", 60, H - 42);
  g.textAlign = "right";
  g.font = `700 16px ${input.sansFont}`;
  spaced(3.5);
  const by = "SPONSORED BY";
  g.font = `800 30px ${input.displayFont}`;
  spaced(-1);
  const vw = g.measureText("ValueChain").width;
  const vc = g.createLinearGradient(W - 60 - vw, 0, W - 60, 0);
  vc.addColorStop(0, c.cardA);
  vc.addColorStop(1, c.cardB);
  g.fillStyle = vc;
  g.fillText("ValueChain", W - 60, H - 40);
  g.fillStyle = c.ink2;
  g.font = `700 16px ${input.sansFont}`;
  spaced(3.5);
  g.fillText(by, W - 60 - vw - 16, H - 44);

  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b === null ? reject(new Error("Could not draw the image.")) : resolve(b)), "image/png"),
  );
}
