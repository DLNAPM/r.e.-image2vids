
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
    I need you to find ACTUAL, PLAYABLE VIDEO CONTENT for the following real estate property. 
    Do not provide links to generic listing pages unless they explicitly contain a video tour.
    
    Target Property:
    Address: ${details.street}, ${details.city}, ${details.state} ${details.zip}
    MLS Number: ${details.mlsNumber}
    
    ${frontImage || backImage ? "I have attached images of the property. Use them to visually confirm the property in video thumbnails if possible." : ""}
    
    STRICT SEARCH REQUIREMENTS:
    1. Search specifically for VIDEO TOURS, WALKTHROUGHS, and DRONE FOOTAGE.
    2. Prioritize these platforms:
       - YouTube (Look for specific video URLs, NOT channels)
       - Vimeo
       - Facebook/Instagram/TikTok (Specific posts with video)
       - Matterport 3D Tours
       - Real Estate Brokerage sites (ONLY if the snippet confirms a "Video Tour" or "Virtual Tour" is present)
    
    3. EXCLUDE:
       - Dead or broken links (e.g. "This video isn't available anymore").
       - "Sold" pages that have removed the media.
       - Generic "homes for sale" search result pages.
       - YouTube Channels (e.g. /channel/ or /user/) - I want specific videos.
       - "How To" videos (e.g. "How to verify YouTube channel", "How to buy a house").
       - Real Estate websites that just list the property details without a video player.
    
    OUTPUT INSTRUCTIONS:
    - Provide a concise summary of the video content found.
    - When listing links, ensure they are high-confidence video links.
    - If you find a YouTube link, verify it is a /watch?v= link or a /shorts/ link, not a channel page.
    
    If no specific video content is found, state "No video tours found" clearly.
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
            const urlObj = new URL(cleanUri); 
            const hostname = urlObj.hostname.toLowerCase();
            const lowerTitle = title.toLowerCase();

            // --- ENHANCED FILTERING ---
            
            // 1. Filter out YouTube Channels/Users
            if (hostname.includes("youtube.com") || hostname.includes("youtu.be")) {
                if (cleanUri.includes("/channel/") || cleanUri.includes("/user/") || cleanUri.includes("/c/")) {
                    return; // Skip channels
                }
            }

            // 2. Filter out generic search pages or map pages if they sneak in
            if (cleanUri.includes("google.com/maps") || cleanUri.includes("google.com/search")) {
                return;
            }

            // 3. Filter out common non-video listing aggregators unless deep linked (heuristic)
            // Many of these just list the MLS text without video.
            // We rely on the model's grounding, but if we see a root domain or generic search, skip it.
            if (urlObj.pathname === "/" || urlObj.pathname.length < 2) {
                 // Likely a homepage, skip
                 return;
            }

            // 3b. Filter out known "Search Result" pages which are rarely specific videos
            // These often just show a map or a list of homes.
            if (hostname.includes("zillow.com") && (cleanUri.includes("/homes/") || cleanUri.includes("_rb"))) {
                 // zillow.com/homes/Address... is usually a map search
                 // zillow.com/homedetails/ is the actual listing (which might have video)
                 if (!cleanUri.includes("/homedetails/")) return;
            }
            if (hostname.includes("realtor.com") && cleanUri.includes("-search")) {
                 return;
            }
            if (hostname.includes("redfin.com") && (cleanUri.includes("/city/") || cleanUri.includes("/zipcode/"))) {
                 return;
            }
            if (hostname.includes("trulia.com") && (cleanUri.includes("/for_sale/") || cleanUri.includes("/sold/"))) {
                 // Trulia for_sale pages are lists. Specific homes are usually /p/
                 if (!cleanUri.includes("/p/")) return;
            }

            // 4. Filter out "How To" or "Verify" videos that are likely unrelated
            if (lowerTitle.includes("how to verify") || lowerTitle.includes("verify youtube channel")) {
                return;
            }

            if (!uniqueVideos.has(cleanUri)) {
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
        // We give these a generic title since we don't have the anchor text easily
        // unless we parse the markdown more deeply.
        addVideo(match, "Mentioned Video Link");
    });

    let videos = Array.from(uniqueVideos.values());

    // --- AVAILABILITY CHECK (YouTube Only) ---
    const checkAvailability = async (video: any) => {
        const isYouTube = video.source.includes("youtube.com") || video.source.includes("youtu.be");
        if (!isYouTube) return true; 

        try {
            const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(video.uri)}&format=json`;
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 3000); 

            const res = await fetch(oembedUrl, { 
                method: 'GET',
                signal: controller.signal
            });
            
            clearTimeout(timeoutId);
            
            if (res.status === 404 || res.status === 401 || res.status === 403) {
                console.warn(`Filtering unavailable YouTube video (Status ${res.status}): ${video.uri}`);
                return false;
            }

            if (!res.ok) {
                 console.warn(`Filtering YouTube video due to error status ${res.status}: ${video.uri}`);
                 return false;
            }

            try {
                const data = await res.json();
                if (data.title === "video unavailable") return false;
            } catch (jsonError) {}

            return true;
        } catch (e) {
            console.warn(`Filtering YouTube video due to verification error: ${video.uri}`, e);
            return false;
        }
    };

    // Filter videos
    const availabilityResults = await Promise.all(finalLinks.map(v => checkAvailability(v)));
    finalLinks = finalLinks.filter((_, index) => availabilityResults[index]);

    return {
      summary,
      videos: finalLinks,
      found: finalLinks.length > 0
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
