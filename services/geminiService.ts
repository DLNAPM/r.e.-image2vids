import { GoogleGenAI } from "@google/genai";
import { PropertyDetails, SearchResponse, ImageFile } from "../types";

// Helper to safely retrieve API Key from various environment configurations
const getApiKey = (): string | undefined => {
  // 1. Standard Node/Webpack/Process injection (Preferred)
  if (typeof process !== 'undefined' && process.env?.API_KEY) {
    return process.env.API_KEY;
  }
  // 2. Vite injection (import.meta.env) - Common on Render
  // We check for VITE_API_KEY as Vite often requires the VITE_ prefix
  if ((import.meta as any).env?.VITE_API_KEY) {
    return (import.meta as any).env.VITE_API_KEY;
  }
  // 3. Check for standard API_KEY in import.meta.env just in case
  if ((import.meta as any).env?.API_KEY) {
    return (import.meta as any).env.API_KEY;
  }
  return undefined;
};

export const searchPropertyVideos = async (
  details: PropertyDetails,
  frontImage: ImageFile | null,
  backImage: ImageFile | null
): Promise<SearchResponse> => {
  const apiKey = getApiKey();
  
  if (!apiKey) {
    throw new Error("API Key not found. Please ensure API_KEY (or VITE_API_KEY) is set in your Render.com Environment Variables.");
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
    
    OUTPUT INSTRUCTIONS:
    1. Provide a helpful summary of what you found.
    2. If you find videos, explicitly list the FULL URL of every video or listing page in the text.
    
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
    
    // Deduplicate videos by URI
    const uniqueVideos = new Map();

    const addVideo = (uri: string, title: string = "Video Link") => {
        try {
            // Basic cleanup of the URI (remove trailing punctuation often captured by regex like . or ,)
            let cleanUri = uri.trim().replace(/[.,;:)]+$/, "");
            
            // Validate URL structure and protocol
            if (!cleanUri.startsWith("http")) return;
            new URL(cleanUri); // throws if invalid

            if (!uniqueVideos.has(cleanUri)) {
                let hostname = "unknown";
                try {
                    hostname = new URL(cleanUri).hostname;
                } catch (e) {}
                
                uniqueVideos.set(cleanUri, {
                    title: title,
                    uri: cleanUri,
                    source: hostname,
                });
            }
        } catch (e) {
            // Invalid URL, skip
        }
    };

    // 1. Extract from Grounding Metadata (High confidence sources)
    const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
    chunks.forEach(chunk => {
        if (chunk.web?.uri) {
            addVideo(chunk.web.uri, chunk.web.title || "Source Link");
        }
    });

    // 2. Extract from Text Response (Fallback for when model mentions links but grounding misses them)
    // Regex to find http/https URLs
    const urlRegex = /(https?:\/\/[^\s<>"']+)/g;
    const textMatches = summary.match(urlRegex) || [];
    
    textMatches.forEach(match => {
        addVideo(match);
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
    throw new Error("Failed to search for videos. Please check your API Key and try again.");
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
  // We re-fetch the key here, prioritizing process.env (which aistudio might inject)
  const apiKey = getApiKey();
  
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