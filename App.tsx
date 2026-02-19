import React, { useState } from 'react';
import { PropertyDetails, ImageFile, SearchResponse } from './types';
import { searchPropertyVideos, generatePromotionalVideo } from './services/geminiService';
import ImageUpload from './components/ImageUpload';
import VideoResult from './components/VideoResult';

function App() {
  // State for form inputs
  const [address, setAddress] = useState({ street: '', city: '', state: '', zip: '' });
  const [mlsNumber, setMlsNumber] = useState('');
  const [frontImage, setFrontImage] = useState<ImageFile | null>(null);
  const [backImage, setBackImage] = useState<ImageFile | null>(null);
  
  // State for UI interaction
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<SearchResponse | null>(null);

  // Help Modal State
  const [showHelp, setShowHelp] = useState(false);
  const [generatingVideo, setGeneratingVideo] = useState(false);
  const [promoVideoUrl, setPromoVideoUrl] = useState<string | null>(null);
  const [videoError, setVideoError] = useState<string | null>(null);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setAddress(prev => ({ ...prev, [name]: value }));
    if (error) setError(null);
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validation
    const missingFields: string[] = [];
    if (!address.street.trim()) missingFields.push("Street Address");
    if (!address.city.trim()) missingFields.push("City");
    if (!address.state.trim()) missingFields.push("State");
    if (!address.zip.trim()) missingFields.push("Zip Code");
    if (!mlsNumber.trim()) missingFields.push("MLS Number");

    if (missingFields.length > 0) {
      setError(`Please fill in the following required field(s): ${missingFields.join(", ")}`);
      return;
    }

    setLoading(true);
    setError(null);
    setResults(null);

    try {
      const propertyDetails: PropertyDetails = { ...address, mlsNumber };
      const response = await searchPropertyVideos(propertyDetails, frontImage, backImage);
      setResults(response);
    } catch (err: any) {
      setError(err.message || "An unexpected error occurred.");
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setAddress({ street: '', city: '', state: '', zip: '' });
    setMlsNumber('');
    setFrontImage(null);
    setBackImage(null);
    setResults(null);
    setError(null);
  };

  const handleGeneratePromo = async () => {
    setGeneratingVideo(true);
    setVideoError(null);
    try {
        const url = await generatePromotionalVideo();
        setPromoVideoUrl(url);
    } catch (err: any) {
        setVideoError("Could not generate video. Please ensure you have a valid API key selected.");
    } finally {
        setGeneratingVideo(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="bg-indigo-600 p-2 rounded-lg">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
            </div>
            <h1 className="text-xl font-bold text-slate-900 tracking-tight">R.E.-Image2Vidz</h1>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-sm text-slate-500 hidden sm:block">
                Powered by Gemini
            </div>
            <button 
                onClick={() => setShowHelp(true)}
                className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-100 text-slate-600 hover:bg-indigo-100 hover:text-indigo-600 transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500"
                aria-label="Help & Information"
            >
                <span className="font-bold text-lg">?</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-grow py-8 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            
            {/* Left Column: Input Form */}
            <div className="lg:col-span-5 space-y-6">
              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 lg:p-8">
                <h2 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
                  <svg className="w-5 h-5 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                  </svg>
                  Property Details
                </h2>
                
                <form onSubmit={handleSearch} className="space-y-4">
                  {/* Address Fields */}
                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-500 uppercase tracking-wider mb-1">
                        Street Address <span className="text-red-500">*</span>
                      </label>
                      <input 
                        type="text" 
                        name="street" 
                        value={address.street} 
                        onChange={handleInputChange}
                        placeholder="123 Maple Avenue"
                        className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-sm ${error && !address.street ? 'border-red-300 bg-red-50' : 'border-slate-300'}`}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-slate-500 uppercase tracking-wider mb-1">
                          City <span className="text-red-500">*</span>
                        </label>
                        <input 
                          type="text" 
                          name="city" 
                          value={address.city} 
                          onChange={handleInputChange}
                          placeholder="Beverly Hills"
                          className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-sm ${error && !address.city ? 'border-red-300 bg-red-50' : 'border-slate-300'}`}
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-500 uppercase tracking-wider mb-1">
                          State <span className="text-red-500">*</span>
                        </label>
                        <input 
                          type="text" 
                          name="state" 
                          value={address.state} 
                          onChange={handleInputChange}
                          placeholder="CA"
                          className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-sm ${error && !address.state ? 'border-red-300 bg-red-50' : 'border-slate-300'}`}
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-slate-500 uppercase tracking-wider mb-1">
                          Zip Code <span className="text-red-500">*</span>
                        </label>
                        <input 
                          type="text" 
                          name="zip" 
                          value={address.zip} 
                          onChange={handleInputChange}
                          placeholder="90210"
                          className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-sm ${error && !address.zip ? 'border-red-300 bg-red-50' : 'border-slate-300'}`}
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-500 uppercase tracking-wider mb-1">
                          MLS Number <span className="text-red-500">*</span>
                        </label>
                        <input 
                          type="text" 
                          name="mlsNumber"
                          value={mlsNumber} 
                          onChange={(e) => {
                            setMlsNumber(e.target.value);
                            if (error) setError(null);
                          }}
                          placeholder="MLS#123456"
                          className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-sm ${error && !mlsNumber ? 'border-red-300 bg-red-50' : 'border-slate-300'}`}
                        />
                      </div>
                    </div>
                  </div>

                  <hr className="border-slate-100 my-4" />

                  <div className="grid grid-cols-2 gap-4">
                    <ImageUpload 
                      id="front-img"
                      label="Front Image" 
                      image={frontImage} 
                      onImageChange={setFrontImage} 
                    />
                    <ImageUpload 
                      id="back-img"
                      label="Back Image" 
                      image={backImage} 
                      onImageChange={setBackImage} 
                    />
                  </div>

                  {error && (
                    <div className="p-3 bg-red-50 text-red-700 text-sm rounded-md border border-red-200 flex items-start gap-2">
                       <svg className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <span>{error}</span>
                    </div>
                  )}

                  <div className="pt-2 flex gap-3">
                    <button 
                      type="submit" 
                      disabled={loading}
                      className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-2.5 px-4 rounded-lg shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                      {loading ? (
                        <>
                          <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                          Searching...
                        </>
                      ) : (
                        <>
                          Search Videos
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                        </>
                      )}
                    </button>
                    {(results || error) && (
                         <button 
                         type="button" 
                         onClick={handleReset}
                         disabled={loading}
                         className="px-4 py-2.5 border border-slate-300 rounded-lg text-slate-600 hover:bg-slate-50 font-medium transition-colors"
                       >
                         Reset
                       </button>
                    )}
                  </div>
                </form>
              </div>
            </div>

            {/* Right Column: Results */}
            <div className="lg:col-span-7">
              {loading ? (
                <div className="h-full min-h-[400px] flex flex-col items-center justify-center text-center p-8 bg-white/50 rounded-2xl border-2 border-dashed border-slate-200">
                  <div className="relative w-20 h-20 mb-6">
                     <div className="absolute top-0 left-0 w-full h-full border-4 border-indigo-200 rounded-full opacity-20 animate-ping"></div>
                     <div className="absolute top-0 left-0 w-full h-full border-4 border-indigo-600 rounded-full border-t-transparent animate-spin"></div>
                  </div>
                  <h3 className="text-xl font-medium text-slate-800 mb-2">Scouring the web...</h3>
                  <p className="text-slate-500 max-w-sm">We are analyzing your property details and images to find matching videos.</p>
                </div>
              ) : results ? (
                <div className="space-y-6">
                   {/* Summary Card */}
                   <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
                      <h3 className="text-lg font-semibold text-slate-900 mb-3">Search Summary</h3>
                      <div className="prose prose-sm text-slate-600 max-w-none">
                        <p>{results.summary}</p>
                      </div>
                   </div>

                   {/* Videos List */}
                   <div>
                     <h3 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
                       Found Videos
                       <span className="bg-indigo-100 text-indigo-700 py-0.5 px-2.5 rounded-full text-xs font-bold">{results.videos.length}</span>
                     </h3>
                     
                     {results.found && results.videos.length > 0 ? (
                       <div className="grid gap-4">
                         {results.videos.map((video, idx) => (
                           <VideoResult key={idx} video={video} />
                         ))}
                       </div>
                     ) : (
                       <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 text-center">
                         <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-amber-100 text-amber-600 mb-4">
                           <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                             <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                           </svg>
                         </div>
                         <h4 className="text-amber-900 font-medium text-lg mb-2">No Videos Found</h4>
                         <p className="text-amber-700 text-sm">
                           No such video exists on the internet related to your Property address and Images uploaded.
                         </p>
                       </div>
                     )}
                   </div>
                </div>
              ) : (
                /* Empty State */
                <div className="h-full flex flex-col items-center justify-center text-center p-12 bg-white rounded-2xl border border-slate-200 shadow-sm opacity-60">
                  <div className="w-64 h-48 mb-6 relative">
                     {/* Abstract illustration for real estate/video */}
                     <svg className="w-full h-full text-slate-200" viewBox="0 0 200 150" fill="currentColor">
                       <rect x="40" y="40" width="120" height="80" rx="8" fill="currentColor" />
                       <path d="M90 70 L120 80 L90 90 Z" fill="white" />
                       <path d="M20 120 L180 120" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
                     </svg>
                  </div>
                  <h3 className="text-lg font-medium text-slate-900 mb-2">Ready to Search</h3>
                  <p className="text-slate-500 max-w-sm">
                    Enter the property address, MLS number, and upload photos to begin searching for related video content.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>

        <footer className="bg-slate-50 border-t border-slate-200 py-6 mt-8">
            <div className="max-w-7xl mx-auto px-4 text-center text-xs text-slate-400">
                <p>Disclaimer: This App is NOT used to spy on properties not for sale and is intended only for serious Real Estate Brokers, Agents, and Investors searching for property information.</p>
            </div>
        </footer>

      {/* Help Modal */}
      {showHelp && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={() => setShowHelp(false)}></div>
            <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden max-h-[90vh] flex flex-col">
                <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                    <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                         <span className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center text-sm">?</span>
                         Help & Information
                    </h2>
                    <button onClick={() => setShowHelp(false)} className="text-slate-400 hover:text-slate-600">
                        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>
                
                <div className="p-6 overflow-y-auto">
                    <div className="space-y-6">
                        
                        <section>
                            <h3 className="text-lg font-semibold text-slate-900 mb-2">About R.E.-Image2Vidz</h3>
                            <p className="text-slate-600 text-sm leading-relaxed">
                                This application helps Real Estate professionals find existing video content for properties. 
                                By combining address data, MLS numbers, and visual recognition from uploaded photos, 
                                we scour the web for matching video tours on platforms like YouTube, Vimeo, and agency sites.
                            </p>
                        </section>

                        <section className="bg-indigo-50 rounded-xl p-5 border border-indigo-100">
                            <h3 className="text-lg font-semibold text-indigo-900 mb-3 flex items-center gap-2">
                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                Promotional Tutorial
                            </h3>
                            <p className="text-sm text-indigo-700 mb-4">
                                Watch an animated guide on how to use the application effectively.
                            </p>
                            
                            {!promoVideoUrl ? (
                                <div>
                                    <button 
                                        onClick={handleGeneratePromo}
                                        disabled={generatingVideo}
                                        className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
                                    >
                                        {generatingVideo ? (
                                            <>
                                                <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                                </svg>
                                                Generating Video (Veo AI)...
                                            </>
                                        ) : (
                                            "Generate & Watch Tutorial"
                                        )}
                                    </button>
                                    <p className="text-xs text-indigo-400 mt-2">
                                        * Uses Gemini Veo. Requires a funded API Key selection.
                                    </p>
                                    {videoError && (
                                        <p className="text-xs text-red-500 mt-2">{videoError}</p>
                                    )}
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    <video controls autoPlay className="w-full rounded-lg shadow-md bg-black aspect-video">
                                        <source src={promoVideoUrl} type="video/mp4" />
                                        Your browser does not support the video tag.
                                    </video>
                                    <button 
                                        onClick={() => setPromoVideoUrl(null)}
                                        className="text-xs text-indigo-600 hover:text-indigo-800 underline"
                                    >
                                        Generate New Video
                                    </button>
                                </div>
                            )}
                        </section>

                        <section className="border-t border-slate-100 pt-4">
                            <h3 className="text-sm font-bold text-red-600 uppercase tracking-wide mb-2">Legal Disclaimer</h3>
                            <div className="bg-red-50 border border-red-100 rounded-lg p-4 text-xs text-red-800 leading-relaxed">
                                <p className="font-medium mb-1">Please Read Carefully:</p>
                                <p>
                                    This App is <strong>NOT</strong> used to spy on properties not for sale and is intended <strong>only</strong> for serious Real Estate Brokers, Agents, and Investors searching for property information. 
                                    Use of this tool to invade privacy or gather information on properties not on the market is strictly prohibited.
                                </p>
                            </div>
                        </section>

                    </div>
                </div>
                
                <div className="p-4 bg-slate-50 border-t border-slate-100 text-right">
                    <button 
                        onClick={() => setShowHelp(false)}
                        className="px-4 py-2 bg-white border border-slate-300 rounded-lg text-slate-700 text-sm font-medium hover:bg-slate-50"
                    >
                        Close
                    </button>
                </div>
            </div>
        </div>
      )}
    </div>
  );
}

export default App;