import { Router } from "express";
import multer from "multer";

const router = Router();

const MAX_FILE_BYTES = 25 * 1024 * 1024; // 25MB per file
const MAX_FILES = 6;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_BYTES, files: MAX_FILES },
});

const IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/jpg", "image/webp", "image/gif"]);

function isProbablyText(mime: string, name: string): boolean {
  if (mime.startsWith("text/")) return true;
  const textExt = [".txt", ".md", ".json", ".csv", ".js", ".ts", ".tsx", ".jsx", ".py", ".java", ".c", ".cpp", ".h", ".css", ".html", ".xml", ".yml", ".yaml", ".sh", ".sql", ".go", ".rs", ".rb", ".php"];
  return textExt.some((e) => name.toLowerCase().endsWith(e));
}

router.post("/", (req, res) => {
  upload.array("files", MAX_FILES)(req, res, (err: unknown) => {
    if (err) {
      const message = err instanceof Error && err.message.includes("File too large") ? "A file exceeds the 25MB limit." : "Upload failed.";
      return res.status(400).json({ error: message });
    }
    const files = (req.files as Express.Multer.File[]) ?? [];
    const result = files.map((f) => {
      const isImage = IMAGE_TYPES.has(f.mimetype);
      const isText = isProbablyText(f.mimetype, f.originalname);
      if (isImage) {
        return {
          name: f.originalname,
          type: f.mimetype,
          size: f.size,
          kind: "image" as const,
          dataBase64: f.buffer.toString("base64"),
        };
      }
      if (isText) {
        return {
          name: f.originalname,
          type: f.mimetype || "text/plain",
          size: f.size,
          kind: "text" as const,
          textContent: f.buffer.toString("utf-8").slice(0, 200_000),
        };
      }
      return {
        name: f.originalname,
        type: f.mimetype || "application/octet-stream",
        size: f.size,
        kind: "unsupported" as const,
      };
    });

    const unsupported = result.filter((r) => r.kind === "unsupported");
    res.json({
      files: result.filter((r) => r.kind !== "unsupported"),
      rejected: unsupported.map((u) => u.name),
    });
  });
});

export default router;
