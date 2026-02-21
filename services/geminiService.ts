
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
    I need you to find the OFFICIAL LISTING AGENT'S WEBSITE and ACTUAL VIDEO CONTENT for the following real estate property.
    
    Target Property:
    Address: ${details.street}, ${details.city}, ${details.state} ${details.zip}
    MLS Number: ${details.mlsNumber}
    
    ${frontImage || backImage ? "I have attached images of the property. You MUST prioritize videos where the content VISUALLY MATCHES these images. The video should feature the specific house shown in the uploaded photos." : ""}
    
    SEARCH REQUIREMENTS:
    1. **FIRST RESULT (Mandatory)**: The Official Listing Page or Listing Agent's Website.
       - A direct link to the property details on the brokerage site (e.g. Coldwell Banker, Compass, Re/Max) or a major portal (Zillow/Redfin/Realtor) if the brokerage site isn't found.
       - Title this "Official Listing Page".
       
    2. **SUBSEQUENT RESULTS**: Direct links to VIDEO TOURS, WALKTHROUGHS, or DRONE FOOTAGE.
       - Platforms: YouTube, Vimeo, Facebook (video posts), Instagram (Reels/video), TikTok, Matterport 3D Tours.
       - Virtual Tours hosted on dedicated domains (e.g. tours.property.com) are also acceptable.
       - **VISUAL MATCHING**: Ensure the videos found actually depict the property shown in the uploaded images.
    
    3. EXCLUDE:
       - Generic search results (e.g. "homes for sale in [City]").
       - Dead links.
       - "Sold" pages if possible (unless they still have the video).
    
    OUTPUT INSTRUCTIONS:
    - Provide a concise summary.
    - List the Official Listing Page as the first link.
    - List Video links afterwards.
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
    const uniqueLinks = new Map();

    const processLink = (uri: string, title: string = "Link") => {
        try {
            // Basic cleanup
            let cleanUri = uri.trim().replace(/[.,;:)]+$/, "");
            
            // Validate URL
            if (!cleanUri.startsWith("http")) return;
            const urlObj = new URL(cleanUri); 
            const hostname = urlObj.hostname.toLowerCase();
            const lowerTitle = title.toLowerCase();

            // --- FILTERING ---
            
            // 1. Filter out YouTube Channels/Users
            if (hostname.includes("youtube.com") || hostname.includes("youtu.be")) {
                if (cleanUri.includes("/channel/") || cleanUri.includes("/user/") || cleanUri.includes("/c/")) {
                    return; 
                }
            }

            // 2. Filter out generic search/map pages
            if (cleanUri.includes("google.com/maps") || cleanUri.includes("google.com/search")) {
                return;
            }

            // 3. Filter out root domains or short paths
            if (urlObj.pathname === "/" || urlObj.pathname.length < 2) {
                 return;
            }

            // 4. Filter out known "Search Result" pages
            if (hostname.includes("zillow.com") && (cleanUri.includes("/homes/") || cleanUri.includes("_rb")) && !cleanUri.includes("/homedetails/")) return;
            if (hostname.includes("realtor.com") && cleanUri.includes("-search")) return;
            if (hostname.includes("redfin.com") && (cleanUri.includes("/city/") || cleanUri.includes("/zipcode/"))) return;
            if (hostname.includes("trulia.com") && (cleanUri.includes("/for_sale/") || cleanUri.includes("/sold/")) && !cleanUri.includes("/p/")) return;

            // 5. Filter out "How To" videos
            if (lowerTitle.includes("how to verify") || lowerTitle.includes("verify youtube channel")) {
                return;
            }

            if (!uniqueLinks.has(cleanUri)) {
                uniqueLinks.set(cleanUri, {
                    title: title,
                    uri: cleanUri,
                    source: hostname,
                });
            }
        } catch (e) {
            // Invalid URL
        }
    };

    // 1. Extract from Grounding Metadata
    const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
    chunks.forEach(chunk => {
        if (chunk.web?.uri) {
            processLink(chunk.web.uri, chunk.web.title || "Source Link");
        }
    });

    // 2. Extract from Text Response
    const urlRegex = /(https?:\/\/[^\s<>"']+)/g;
    const textMatches = summary.match(urlRegex) || [];
    textMatches.forEach(match => {
        processLink(match, "Mentioned Link");
    });

    const allLinks = Array.from(uniqueLinks.values());

    // --- CATEGORIZATION & SORTING ---
    // Requirement: First link = Listing Agent Website. Rest = ONLY Video links.

    let listingPage: any = null;
    const videoLinks: any[] = [];

    const isVideoPlatform = (source: string, uri: string) => {
        const s = source.toLowerCase();
        const u = uri.toLowerCase();
        return s.includes('youtube') || s.includes('youtu.be') || s.includes('vimeo') || 
               s.includes('tiktok') || s.includes('facebook') || s.includes('instagram') || 
               s.includes('matterport') || u.includes('tour') || u.includes('video');
    };

    for (const link of allLinks) {
        if (isVideoPlatform(link.source, link.uri)) {
            videoLinks.push(link);
        } else {
            // It's a potential listing page.
            // We only want the FIRST one we found (which usually corresponds to the first one mentioned/found).
            if (!listingPage) {
                listingPage = link;
                listingPage.title = "Official Listing Page"; // Enforce title
            }
            // Discard subsequent non-video links per requirement "rest of the Links ONLY Video links"
        }
    }

    // Construct final list
    let finalLinks = [];
    if (listingPage) {
        finalLinks.push(listingPage);
    }
    finalLinks = [...finalLinks, ...videoLinks];

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
