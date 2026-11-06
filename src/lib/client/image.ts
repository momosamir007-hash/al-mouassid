export interface EditOptions {
  rotation: 0 | 90 | 180 | 270;
  /** نسب القص من كل جهة (0–45) */
  crop: { left: number; top: number; right: number; bottom: number };
  enhance: boolean;
  maxSide: number;
}

export function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("تعذّر قراءة الصورة. جرّب صورة JPG أو PNG."));
    };
    img.src = url;
  });
}

/** تدوير ثم قص ثم (اختيارياً) تحسين التباين والتدرج الرمادي. */
export function renderEdited(img: HTMLImageElement, opts: EditOptions): HTMLCanvasElement {
  const scale = Math.min(1, opts.maxSide / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.round(img.naturalWidth * scale);
  const h = Math.round(img.naturalHeight * scale);
  const swap = opts.rotation === 90 || opts.rotation === 270;

  const rotated = document.createElement("canvas");
  rotated.width = swap ? h : w;
  rotated.height = swap ? w : h;
  const rctx = rotated.getContext("2d")!;
  rctx.translate(rotated.width / 2, rotated.height / 2);
  rctx.rotate((opts.rotation * Math.PI) / 180);
  rctx.drawImage(img, -w / 2, -h / 2, w, h);

  const { left, top, right, bottom } = opts.crop;
  const sx = Math.round((rotated.width * left) / 100);
  const sy = Math.round((rotated.height * top) / 100);
  const sw = Math.max(8, rotated.width - sx - Math.round((rotated.width * right) / 100));
  const sh = Math.max(8, rotated.height - sy - Math.round((rotated.height * bottom) / 100));

  const out = document.createElement("canvas");
  out.width = sw;
  out.height = sh;
  const octx = out.getContext("2d", { willReadFrequently: true })!;
  octx.fillStyle = "#fff";
  octx.fillRect(0, 0, sw, sh);
  octx.drawImage(rotated, sx, sy, sw, sh, 0, 0, sw, sh);

  if (opts.enhance) {
    const data = octx.getImageData(0, 0, sw, sh);
    const px = data.data;
    const hist = new Uint32Array(256);
    for (let i = 0; i < px.length; i += 4) {
      const g = Math.round(0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2]);
      px[i] = px[i + 1] = px[i + 2] = g;
      hist[g]++;
    }
    const total = sw * sh;
    let acc = 0;
    let lo = 0;
    let hi = 255;
    for (let i = 0; i < 256; i++) {
      acc += hist[i];
      if (acc >= total * 0.02) {
        lo = i;
        break;
      }
    }
    acc = 0;
    for (let i = 255; i >= 0; i--) {
      acc += hist[i];
      if (acc >= total * 0.02) {
        hi = i;
        break;
      }
    }
    const range = Math.max(1, hi - lo);
    for (let i = 0; i < px.length; i += 4) {
      const v = Math.max(0, Math.min(255, ((px[i] - lo) * 255) / range));
      px[i] = px[i + 1] = px[i + 2] = v;
    }
    octx.putImageData(data, 0, 0);
  }
  return out;
}

/** base64 (بدون بادئة) بصيغة JPEG مضغوطة لإرسالها مع الطلب فقط؛ لا تُخزَّن. */
export function canvasToJpegBase64(canvas: HTMLCanvasElement, quality = 0.82): string {
  return canvas.toDataURL("image/jpeg", quality).split(",")[1] ?? "";
}

// تسليم الصورة بين صفحة الالتقاط وصفحة المساعدة في الذاكرة فقط (لا تُحفظ في أي تخزين).
interface Handoff {
  exerciseId: string;
  mime: "image/jpeg";
  data: string;
  preview: string;
}
let handoff: Handoff | null = null;
export const setHandoff = (h: Handoff | null) => {
  handoff = h;
};
export const getHandoff = (exerciseId: string): Handoff | null => (handoff && handoff.exerciseId === exerciseId ? handoff : null);
