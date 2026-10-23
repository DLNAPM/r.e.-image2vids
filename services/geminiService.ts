
import { GoogleGenAI } from "@google/genai";
import { PropertyDetails, SearchResponse, ImageFile } from "../types";

// Helper to sanitize an API key (strips quotes, whitespace, newlines, and invalid values)
const cleanApiKey = (val?: string | null): string => {
  if (!val || typeof val !== 'string') return '';
  let str = val.trim();
  // Strip surrounding quotes or backticks that may have been pasted into Render's UI
  str = str.replace(/^["'`]+|["'`]+$/g, '').trim();
  str = str.replace(/[\r\n\t]/g, '').trim();
  if (str === 'undefined' || str === 'null' || str === 'false') return '';
  return str;
};

// Helper to safely retrieve API Key from various environment configurations (Render.com, Vite, Node)
const getApiKey = (): string | undefined => {
  const candidateKeys = [
    typeof process !== 'undefined' ? process.env?.GEMINI_API_KEY : undefined,
    typeof process !== 'undefined' ? process.env?.API_KEY : undefined,
    typeof process !== 'undefined' ? (process.env as any)?.VITE_GEMINI_API_KEY : undefined,
    typeof process !== 'undefined' ? (process.env as any)?.VITE_API_KEY : undefined,
    typeof process !== 'undefined' ? (process.env as any)?.GOOGLE_API_KEY : undefined,
    (import.meta as any).env?.GEMINI_API_KEY,
    (import.meta as any).env?.API_KEY,
    (import.meta as any).env?.VITE_GEMINI_API_KEY,
    (import.meta as any).env?.VITE_API_KEY,
    (import.meta as any).env?.GOOGLE_API_KEY,
    (import.meta as any).env?.VITE_GOOGLE_API_KEY,
  ];

  // 1. Prioritize valid Google API keys starting with standard prefix 'AIza'
  for (const candidate of candidateKeys) {
    const cleaned = cleanApiKey(candidate);
    if (cleaned && cleaned.startsWith('AIza')) {
      return cleaned;
    }
  }

  // 2. Fall back to any non-empty cleaned candidate
  for (const candidate of candidateKeys) {
    const cleaned = cleanApiKey(candidate);
    if (cleaned && cleaned.length >= 10) {
      return cleaned;
    }
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
    throw new Error("Gemini API Key not found. Please ensure GEMINI_API_KEY (or API_KEY) is set in your Render.com Environment Variables and trigger a rebuild.");
  }

  const ai = new GoogleGenAI({ apiKey });

  // Use flash for speed, or pro for better reasoning. Flash supports search nicely.
  // Instruction says: "Upgrade to `gemini-3-pro-image-preview` if the user requests real-time information using the `googleSearch` tool."
  // Since we are searching, we should use the recommended model for search + images.
  const modelId = 'gemini-3-pro-image-preview'; 

  const isDescriptionMode = details.searchMode === 'description_images' || (!details.street && !!details.description);

  const prompt = isDescriptionMode ? `
    I need you to find ACTUAL, PLAYABLE VIDEO CONTENT for the following real estate property based on its City, State, Zip Code, typed description, and 2 uploaded property images.
    Do not provide links to generic listing pages unless they explicitly contain a video tour.
    
    Target Property Location:
    City: ${details.city}
    State: ${details.state}
    Zip Code: ${details.zip}
    
    Property Description provided by the agent/user:
    "${details.description || ''}"
    
    Visual Information:
    Two images of the property are attached (Image 1: Front/Exterior, Image 2: Interior/Back/Feature).
    Analyze their visual architecture, colors, layout, and distinguishing features, and compare them with video thumbnails and tour media.
    
    SEARCH STRATEGY:
    - You MUST use the Google Search tool.
    - Perform specific Google searches to find video tours or listings matching this property in ${details.city}, ${details.state} ${details.zip}:
      1. "${details.city} ${details.state} ${details.zip} real estate video tour"
      2. "${details.city} ${details.state} virtual tour"
      3. "${details.city} ${details.zip} video walkthrough"
      4. Search queries combining "${details.city} ${details.state}" with key architectural and distinctive phrases from the description: "${(details.description || '').slice(0, 100)}"
      5. Search on YouTube for video walkthroughs, listing tours, and reels in "${details.city} ${details.state} ${details.zip}" matching the property details.
      6. Use the visual features in the 2 attached images (exterior style, front elevation, interior finishes) to verify video walkthrough matches.
    
    STRICT SEARCH REQUIREMENTS:
    1. Search specifically for VIDEO TOURS, WALKTHROUGHS, and DRONE FOOTAGE.
    2. Prioritize these platforms:
       - YouTube (Look for specific video URLs: /watch?v= or /shorts/, NOT generic channel pages)
       - Vimeo
       - Facebook/Instagram/TikTok (Specific posts with video)
       - Matterport 3D Tours
       - Real Estate Brokerage sites (ONLY if the snippet confirms a "Video Tour" or "Virtual Tour" is present)
    
    3. EXCLUDE:
       - Generic "homes for sale" search result pages or map pages.
       - "How To" videos or generic real estate advice.
    
    OUTPUT INSTRUCTIONS:
    - Provide a concise summary of the video content found.
    - LIST ALL DISCOVERED VIDEO LINKS in PLAIN TEXT. Do not use markdown formatting for links.
    - If you find a YouTube link, verify it is a /watch?v= link or a /shorts/ link, not a channel page.
    
    If no specific video content is found, state "No video tours found" clearly.
  ` : `
    I need you to find ACTUAL, PLAYABLE VIDEO CONTENT for the following real estate property. 
    Do not provide links to generic listing pages unless they explicitly contain a video tour.
    
    Target Property:
    Address: ${details.street || ''}, ${details.city}, ${details.state} ${details.zip}
    MLS Number: ${details.mlsNumber || ''}
    
    ${frontImage || backImage ? "I have attached images of the property. Use them to visually confirm the property in video thumbnails if possible." : ""}
    
    SEARCH STRATEGY:
    - You MUST use the Google Search tool.
    - Perform specific searches for:
      1. "${details.street || ''} ${details.city} ${details.state} video"
      2. "${details.mlsNumber || ''} video tour"
      3. "${details.street || ''} YouTube"
      4. "${details.street || ''} virtual tour"
      5. "${(details.street || '').replace(/\bS\b/, 'South').replace(/\bDr\b/, 'Drive')} video"
      ${frontImage ? `6. Search for videos matching the visual content of the attached front image on YouTube.` : ""}
    
    STRICT SEARCH REQUIREMENTS:
    1. Search specifically for VIDEO TOURS, WALKTHROUGHS, and DRONE FOOTAGE.
    2. Prioritize these platforms:
       - YouTube (Look for specific video URLs, NOT channels)
       - Vimeo
       - Facebook/Instagram/TikTok (Specific posts with video)
       - Matterport 3D Tours
       - Real Estate Brokerage sites (ONLY if the snippet confirms a "Video Tour" or "Virtual Tour" is present)
    
    3. EXCLUDE:
       - Generic "homes for sale" search result pages.
       - "How To" videos or generic real estate advice.
    
    OUTPUT INSTRUCTIONS:
    - Provide a concise summary of the video content found.
    - LIST ALL DISCOVERED VIDEO LINKS in PLAIN TEXT. Do not use markdown formatting for links.
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
            // Basic cleanup of the URI (remove trailing punctuation often captured by regex like . or , or brackets)
            let cleanUri = uri.trim().replace(/[.,;:\])>]+$/, "");
            if (cleanUri.includes('](')) {
              cleanUri = cleanUri.split('](')[0].trim();
            }
            if (cleanUri.endsWith(']')) {
              cleanUri = cleanUri.slice(0, -1).trim();
            }
            
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
    // Regex to find http/https URLs - specifically exclude markdown brackets
    const urlRegex = /(https?:\/\/[^\s<>"'[\]()]+)/g;
    const textMatches = summary.match(urlRegex) || [];
    
    textMatches.forEach(match => {
        // We give these a generic title since we don't have the anchor text easily
        addVideo(match, "Found in Summary");
    });

    let videos = Array.from(uniqueVideos.values());

    // --- AVAILABILITY CHECK (YouTube Only) ---
    const checkAvailability = async (video: any) => {
        const isYouTube = video.source.includes("youtube.com") || video.source.includes("youtu.be");
        if (!isYouTube) return true; 

        try {
            const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(video.uri)}&format=json`;
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 5000); // Increased to 5 seconds

            const res = await fetch(oembedUrl, { 
                method: 'GET',
                signal: controller.signal
            });
            
            clearTimeout(timeoutId);
            
            if (res.status === 404) {
                console.warn(`Filtering unavailable YouTube video (Status ${res.status}): ${video.uri}`);
                return false;
            }

            if (!res.ok) {
                 // Other errors (401, 403, 500) might be API restrictions or temporary. Let's keep it to be safe.
                 console.warn(`YouTube verification returned status ${res.status}, but keeping video: ${video.uri}`);
                 return true;
            }

            try {
                const data = await res.json();
                if (data.title === "video unavailable") return false;
            } catch (jsonError) {}

            return true;
        } catch (e) {
            // Network error, timeout, or CORS block.
            // If we can't verify, we should DEFAULT TO SHOWING IT to avoid false negatives.
            // The user prefers seeing videos over seeing nothing.
            console.warn(`Verification failed (network/CORS), keeping video: ${video.uri}`, e);
            return true;
        }
    };

    // Filter videos
    const availabilityResults = await Promise.all(videos.map(v => checkAvailability(v)));
    videos = videos.filter((_, index) => availabilityResults[index]);

    return {
      summary,
      videos: videos,
      found: videos.length > 0
    };

  } catch (error: any) {
    console.error("Gemini API Error:", error);
    const errorStr = (error?.message || error?.toString() || JSON.stringify(error) || "").toLowerCase();
    if (errorStr.includes("api_key_invalid") || errorStr.includes("api key not valid")) {
      throw new Error(
        "The Gemini API key was rejected by Google as invalid. On Render.com: " +
        "1) Make sure GEMINI_API_KEY (or API_KEY) is set in Environment Variables without any quotation marks. " +
        "2) In Render's dashboard, trigger 'Manual Deploy' > 'Clear build cache & deploy' so Vite rebuilds with the new key."
      );
    }
    throw new Error(error?.message || "Failed to search for videos. Please check your API Key and try again.");
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
