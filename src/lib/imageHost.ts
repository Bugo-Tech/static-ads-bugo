import { readFile } from "fs/promises";

const FREEIMAGE_API = "https://freeimage.host/api/1/upload";
const FREEIMAGE_KEY = "6d207e02198a847aa98d0a2a901485a5";

/**
 * Upload a local file to freeimage.host and get a public URL.
 * This is needed because kie.ai's google/nano-banana model
 * requires public URLs for image_input (base64 causes server errors).
 */
export async function uploadToPublicHost(filePath: string): Promise<string> {
  const buffer = await readFile(filePath);
  const base64 = buffer.toString("base64");

  const formData = new FormData();
  formData.append("key", FREEIMAGE_KEY);
  formData.append("source", base64);
  formData.append("format", "json");

  const res = await fetch(FREEIMAGE_API, {
    method: "POST",
    body: formData,
  });

  if (!res.ok) {
    throw new Error(`Image upload failed: ${res.status}`);
  }

  const data = await res.json();
  const url = data?.image?.url;

  if (!url) {
    throw new Error(`Image upload returned no URL: ${JSON.stringify(data)}`);
  }

  return url;
}
