const API_BASE = "https://api.kie.ai/api/v1";

function getApiKey(): string {
  const key = process.env.NANO_BANANA_API_KEY;
  if (!key) throw new Error("NANO_BANANA_API_KEY not set");
  return key;
}

interface GenerateImageParams {
  prompt: string;
  referenceImageUrl?: string;
  productImageUrl?: string;
  size: "1:1" | "9:16";
}

interface GenerateResponse {
  jobId: string;
}

interface StatusResponse {
  status: "pending" | "processing" | "completed" | "failed";
  resultUrl?: string;
  error?: string;
}

export async function submitGeneration(params: GenerateImageParams): Promise<GenerateResponse> {
  const apiKey = getApiKey();

  const input: Record<string, unknown> = {
    prompt: params.prompt,
    aspect_ratio: params.size === "9:16" ? "9:16" : "1:1",
    resolution: "2K",
    output_format: "png",
  };

  // Build image_input array — must be public URLs (base64 causes server errors)
  const imageInputs: string[] = [];
  if (params.referenceImageUrl) {
    imageInputs.push(params.referenceImageUrl);
  }
  if (params.productImageUrl) {
    imageInputs.push(params.productImageUrl);
  }
  if (imageInputs.length > 0) {
    input.image_input = imageInputs;
  }

  const body = {
    model: "nano-banana-pro",
    input,
  };

  // Debug: log exactly what we're sending
  console.log("=== kie.ai REQUEST ===");
  console.log("Prompt (first 200 chars):", params.prompt.substring(0, 200));
  console.log("Image inputs:", imageInputs.map(u => u.substring(0, 80)));
  console.log("Size:", params.size);
  console.log("Full body keys:", JSON.stringify({ model: body.model, inputKeys: Object.keys(input), imageCount: imageInputs.length }));
  console.log("=== END ===");

  const res = await fetch(`${API_BASE}/jobs/createTask`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`kie.ai API error: ${res.status} — ${text}`);
  }

  const data = await res.json();
  if (data.code !== 200) {
    throw new Error(`kie.ai API error: ${data.msg}`);
  }

  const taskId = data.data?.taskId;
  if (!taskId) {
    throw new Error(`kie.ai API returned no taskId: ${JSON.stringify(data)}`);
  }

  return { jobId: taskId };
}

export async function checkStatus(jobId: string): Promise<StatusResponse> {
  const apiKey = getApiKey();

  const res = await fetch(`${API_BASE}/jobs/recordInfo?taskId=${jobId}`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  });

  if (!res.ok) {
    return { status: "processing" };
  }

  const data = await res.json();
  const record = data.data;

  if (!record) {
    return { status: "processing" };
  }

  // Map kie.ai states: waiting, queuing, generating, success, fail
  const state = (record.state || "").toLowerCase();

  if (state === "success") {
    // Parse resultJson to get the image URL
    let resultUrl: string | undefined;
    try {
      const resultData = JSON.parse(record.resultJson);
      resultUrl = resultData.resultUrls?.[0] || resultData.resultImageUrl || resultData.url;
    } catch {
      resultUrl = record.resultJson; // might be a direct URL
    }
    return { status: "completed", resultUrl };
  }

  if (state === "fail") {
    return {
      status: "failed",
      error: record.failMsg || "Generation failed",
    };
  }

  // waiting, queuing, generating = still processing
  return { status: "processing" };
}
