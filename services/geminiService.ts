import { GoogleGenAI } from "@google/genai";
import { PropertyDetails, SearchResponse, ImageFile } from "../types";

export const searchPropertyVideos = async (
  details: PropertyDetails,
  frontImage: ImageFile | null,
  backImage: ImageFile | null
): Promise<SearchResponse> => {
  const apiKey = process.env.API_KEY;
  if (!apiKey) {
    throw new Error("API Key not found in environment variables");
  }

  const ai = new GoogleGenAI({ apiKey });

  // Use flash for speed, or pro for better reasoning. Flash supports search nicely.
  // Instruction says: "Upgrade to `gemini-3-pro-image-preview` if the user requests real-time information using the `googleSearch` tool."
  // Since we are searching, we should use the recommended model for search + images.
  const modelId = 'gemini-3-pro-image-preview'; 

  const prompt = `
    I am looking for video tours, listing videos, or YouTube clips for a specific real estate property.
    
    Property Details:
    Address: ${details.street}, ${details.city}, ${details.state} ${details.zip}
    MLS Number: ${details.mlsNumber}
    
    ${frontImage || backImage ? "Attached are images of the property." : ""}
    
    Please search the web specifically for ALL available videos related to this property. 
    Look for YouTube links, Vimeo links, Zillow/Redfin video tours, or real estate agency video pages.
    
    I want you to find as many relevant video links as possible.
    If you find relevant video links, list them. 
    
    If you absolutely cannot find any VIDEO content related to this specific address and MLS number, state that clearly.
  `;

  // Build request parts dynamically
  const requestParts: any[] = [{ text: prompt }];

  if (frontImage) {
    requestParts.push({
      inlineData: {
        mimeType: frontImage.mimeType,
        data: frontImage.base64
      }
    });
  }

  if (backImage) {
    requestParts.push({
      inlineData: {
        mimeType: backImage.mimeType,
        data: backImage.base64
      }
    });
  }

  try {
    const response = await ai.models.generateContent({
      model: modelId,
      contents: {
        parts: requestParts
      },
      config: {
        tools: [{ googleSearch: {} }]
      }
    });

    const summary = response.text || "No summary provided.";
    const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
    
    // Deduplicate videos by URI
    const uniqueVideos = new Map();

    chunks.forEach(chunk => {
        if (chunk.web?.uri) {
            const uri = chunk.web.uri;
            // Basic normalization to avoid duplicates with/without trailing slash or query params if needed, 
            // but strict URI check is usually safer to prevent breaking valid distinct links.
            if (!uniqueVideos.has(uri)) {
                let hostname = "unknown";
                try {
                    hostname = new URL(uri).hostname;
                } catch (e) {
                    // ignore invalid urls
                }
                
                uniqueVideos.set(uri, {
                    title: chunk.web.title || "Video Link",
                    uri: uri,
                    source: hostname,
                });
            }
        }
    });

    const videos = Array.from(uniqueVideos.values());
    const hasResults = videos.length > 0;

    return {
      summary,
      videos,
      found: hasResults
    };

  } catch (error) {
    console.error("Gemini API Error:", error);
    throw new Error("Failed to search for videos. Please try again.");
  }
};

export const generatePromotionalVideo = async (): Promise<string> => {
  // Ensure the user has selected a paid API key for Veo
  // Cast window to any to access aistudio which might be defined globally with a conflicting type
  const aistudio = (window as any).aistudio;
  
  if (aistudio) {
    const hasKey = await aistudio.hasSelectedApiKey();
    if (!hasKey) {
      await aistudio.openSelectKey();
    }
  }

  // Create a new instance with the potentially newly selected key
  const apiKey = process.env.API_KEY;
  if (!apiKey) throw new Error("API Key not found");
  
  const ai = new GoogleGenAI({ apiKey });

  const prompt = "An animated tutorial video showing a clean web application interface for Real Estate. Screen shows a form with fields: Street, City, State, Zip, MLS#. A cursor fills in '123 Maple Dr', 'Beverly Hills', 'CA', '90210'. A user uploads a property photo. The cursor clicks a blue 'Search' button. The screen transitions to show a list of video results found. The animation is sleek, professional, with a blue and white color scheme, demonstrating how to use the R.E.-Image2Vidz app.";

  try {
    let operation = await ai.models.generateVideos({
      model: 'veo-3.1-fast-generate-preview',
      prompt: prompt,
      config: {
        numberOfVideos: 1,
        resolution: '720p',
        aspectRatio: '16:9'
      }
    });

    // Poll for completion
    while (!operation.done) {
      await new Promise(resolve => setTimeout(resolve, 5000)); // Poll every 5 seconds
      operation = await ai.operations.getVideosOperation({operation: operation});
    }

    const videoUri = operation.response?.generatedVideos?.[0]?.video?.uri;
    if (!videoUri) {
      throw new Error("Video generation completed but no URI was returned.");
    }

    // Append API key to fetch the video content
    return `${videoUri}&key=${apiKey}`;

  } catch (error) {
    console.error("Veo API Error:", error);
    throw new Error("Failed to generate promotional video.");
  }
};