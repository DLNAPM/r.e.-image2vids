
import React, { useState, useEffect } from 'react';
import { PropertyDetails, ImageFile, SearchResponse, SavedSearch } from './types';
import { searchPropertyVideos, generatePromotionalVideo } from './services/geminiService';
import { auth, db, googleProvider } from './services/firebase';
import firebase from 'firebase/compat/app';
import { collection, addDoc, query, where, orderBy, getDocs, Timestamp, deleteDoc, updateDoc, doc } from 'firebase/firestore';
import { jsPDF } from 'jspdf';
import ImageUpload from './components/ImageUpload';
import VideoResult from './components/VideoResult';

function App() {
  // Auth State
  const [user, setUser] = useState<firebase.User | any | null>(null);
  
  // State for form inputs
  const [address, setAddress] = useState({ street: '', city: '', state: '', zip: '' });
  const [mlsNumber, setMlsNumber] = useState('');
  const [frontImage, setFrontImage] = useState<ImageFile | null>(null);
  const [backImage, setBackImage] = useState<ImageFile | null>(null);
  
  // State for UI interaction
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<SearchResponse | null>(null);

  // Help/History Modal State
  const [showHelp, setShowHelp] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [historyList, setHistoryList] = useState<SavedSearch[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);

  // Edit History State
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitleValue, setEditTitleValue] = useState('');

  // Video Generation State
  const [generatingVideo, setGeneratingVideo] = useState(false);
  const [promoVideoUrl, setPromoVideoUrl] = useState<string | null>(null);
  const [videoError, setVideoError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  // Auth Listener
  useEffect(() => {
    if (auth) {
      const unsubscribe = auth.onAuthStateChanged((currentUser: firebase.User | null) => {
        setUser(currentUser);
      });
      return () => unsubscribe();
    }
  }, []);

  const handleLogin = async () => {
    setError(null);
    if (auth && googleProvider) {
      try {
        // Force account selection to allow switching accounts
        googleProvider.setCustomParameters({ prompt: 'select_account' });
        await auth.signInWithPopup(googleProvider);
      } catch (err: any) {
        setError("Login failed: " + err.message);
      }
    } else {
      // Fallback to Guest Mode if Firebase is not configured
      console.log("Firebase not configured. Using Guest Mode.");
      const guestUser = {
        uid: 'guest-' + Date.now(),
        displayName: 'Guest User',
        email: 'guest@demo.com',
        photoURL: null,
        isAnonymous: true
      };
      setUser(guestUser);
    }
  };

  const handleLogout = async () => {
    if (auth) {
      await auth.signOut();
    }
    setUser(null);
    setHistoryList([]);
  };

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
    setSaveStatus('idle');

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

  const handleSaveSearch = async () => {
    if (!user || !results) return;
    
    setSaveStatus('saving');
    try {
      const propertyDetails: PropertyDetails = { ...address, mlsNumber };
      const searchData: SavedSearch = {
        userId: user.uid,
        timestamp: Date.now(),
        title: address.street, // Default title
        propertyDetails,
        results
      };

      if (db) {
        await addDoc(collection(db, 'searches'), searchData);
      } else {
        // LocalStorage Fallback
        const existing = localStorage.getItem('re_app_searches');
        const searches: SavedSearch[] = existing ? JSON.parse(existing) : [];
        searches.push({ ...searchData, id: 'local-' + Date.now() });
        localStorage.setItem('re_app_searches', JSON.stringify(searches));
      }

      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 3000);
    } catch (err) {
      console.error(err);
      setSaveStatus('error');
    }
  };

  const loadHistory = async () => {
    if (!user) return;
    setLoadingHistory(true);
    setHistoryError(null);
    setShowHistory(true);
    setEditingId(null); 
    try {
      let items: SavedSearch[] = [];

      if (db) {
        // 1. Query owned searches - Remove orderBy to avoid index requirements
        const ownedQuery = query(
            collection(db, 'searches'),
            where('userId', '==', user.uid)
        );
        
        // 2. Query shared searches (if user has email) - Remove orderBy
        let sharedSnapshot: any = { empty: true };
        if (user.email) {
            try {
                const normalizedUserEmail = user.email.toLowerCase();
                console.log("Attempting to fetch shared searches for:", normalizedUserEmail);
                
                const sharedQuery = query(
                    collection(db, 'searches'),
                    where('sharedWith', 'array-contains', normalizedUserEmail)
                );
                sharedSnapshot = await getDocs(sharedQuery);
                console.log("Shared searches found:", sharedSnapshot.size);
            } catch (e: any) {
                console.error("Shared search query failed:", e);
                if (e.code === 'permission-denied') {
                    setHistoryError("Could not load shared searches. Database permissions may need updating.");
                } else {
                    setHistoryError("Failed to load some shared searches.");
                }
            }
        }

        const ownedSnapshot = await getDocs(ownedQuery);
        
        // Merge and deduplicate
        const uniqueItems = new Map();
        
        ownedSnapshot.forEach((doc) => {
            uniqueItems.set(doc.id, { id: doc.id, ...doc.data() } as SavedSearch);
        });
        
        if (!sharedSnapshot.empty) {
            sharedSnapshot.forEach((doc: any) => {
                if (!uniqueItems.has(doc.id)) {
                    uniqueItems.set(doc.id, { id: doc.id, ...doc.data() } as SavedSearch);
                }
            });
        }

        // Sort in memory
        items = Array.from(uniqueItems.values()).sort((a, b) => b.timestamp - a.timestamp);

      } else {
        // LocalStorage Fallback
        const existing = localStorage.getItem('re_app_searches');
        const allSearches: SavedSearch[] = existing ? JSON.parse(existing) : [];
        items = allSearches
            .filter(s => s.userId === user.uid)
            .sort((a, b) => b.timestamp - a.timestamp);
      }

      setHistoryList(items);
    } catch (err) {
      console.error("Error loading history:", err);
    } finally {
      setLoadingHistory(false);
    }
  };

  const handleShareSearchAccess = async (item: SavedSearch, e: React.MouseEvent) => {
      e.stopPropagation();
      if (!db || item.id?.startsWith('local-')) {
          alert("Sharing is only available when logged in and online.");
          return;
      }
      
      const email = prompt("Enter the Google Email address to share this search with:");
      if (!email) return;
      
      const normalizedEmail = email.toLowerCase().trim();
      
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
          alert("Please enter a valid email address.");
          return;
      }

      try {
          const docRef = doc(db, 'searches', item.id!);
          
          const currentShared = item.sharedWith || [];
          if (currentShared.includes(normalizedEmail)) {
              alert("User already has access.");
              return;
          }
          
          const updatedShared = [...currentShared, normalizedEmail];
          await updateDoc(docRef, { sharedWith: updatedShared });
          
          alert(`Shared successfully with ${normalizedEmail}`);
          // Update local state
          setHistoryList(prev => prev.map(s => s.id === item.id ? { ...s, sharedWith: updatedShared } : s));

      } catch (err) {
          console.error("Error sharing search:", err);
          alert("Failed to share search.");
      }
  };

  const restoreSearch = (item: SavedSearch) => {
    setAddress(item.propertyDetails);
    setMlsNumber(item.propertyDetails.mlsNumber);
    setResults(item.results);
    setShowHistory(false);
    setSaveStatus('saved'); // Already saved
  };

  // --- Deletion and Editing Logic ---

  const handleDeleteSearch = async (itemId: string, e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent loading the search
    if (!window.confirm("Are you sure you want to delete this saved search?")) return;

    try {
        if (db && !itemId.startsWith('local-')) {
            await deleteDoc(doc(db, 'searches', itemId));
        } else {
            const existing = localStorage.getItem('re_app_searches');
            if (existing) {
                const searches: SavedSearch[] = JSON.parse(existing);
                const updated = searches.filter(s => s.id !== itemId);
                localStorage.setItem('re_app_searches', JSON.stringify(updated));
            }
        }
        // Update UI
        setHistoryList(prev => prev.filter(item => item.id !== itemId));
    } catch (err) {
        console.error("Error deleting search:", err);
        alert("Failed to delete search.");
    }
  };

  const startEditing = (item: SavedSearch, e: React.MouseEvent) => {
      e.stopPropagation();
      setEditingId(item.id!);
      setEditTitleValue(item.title || item.propertyDetails.street);
  };

  const cancelEditing = (e: React.MouseEvent) => {
      e.stopPropagation();
      setEditingId(null);
      setEditTitleValue('');
  };

  const saveEdit = async (itemId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
        if (db && !itemId.startsWith('local-')) {
             await updateDoc(doc(db, 'searches', itemId), { title: editTitleValue });
        } else {
            const existing = localStorage.getItem('re_app_searches');
            if (existing) {
                const searches: SavedSearch[] = JSON.parse(existing);
                const index = searches.findIndex(s => s.id === itemId);
                if (index !== -1) {
                    searches[index].title = editTitleValue;
                    localStorage.setItem('re_app_searches', JSON.stringify(searches));
                }
            }
        }
        
        // Update local state
        setHistoryList(prev => prev.map(item => 
            item.id === itemId ? { ...item, title: editTitleValue } : item
        ));
        setEditingId(null);
    } catch (err) {
        console.error("Error updating title:", err);
        alert("Failed to update title.");
    }
  };

  // --- End Deletion and Editing Logic ---

  const generatePDF = () => {
    if (!results) return;
    const doc = new jsPDF();
    
    // Header
    doc.setFillColor(79, 70, 229); // Indigo 600
    doc.rect(0, 0, 210, 20, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(16);
    doc.text("R.E.-Image2Vidz Property Report", 10, 13);

    // Property Details
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(14);
    doc.text(`${address.street}, ${address.city}, ${address.state} ${address.zip}`, 10, 35);
    doc.setFontSize(11);
    doc.setTextColor(100, 100, 100);
    doc.text(`MLS#: ${mlsNumber}  |  Generated: ${new Date().toLocaleDateString()}`, 10, 42);

    // Summary
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(12);
    doc.text("Search Summary:", 10, 55);
    
    doc.setFontSize(10);
    doc.setTextColor(60, 60, 60);
    const splitSummary = doc.splitTextToSize(results.summary, 190);
    doc.text(splitSummary, 10, 62);

    // Links
    let yPos = 62 + (splitSummary.length * 5) + 10;
    
    doc.setFontSize(12);
    doc.setTextColor(0, 0, 0);
    doc.text(`Found Videos (${results.videos.length})`, 10, yPos);
    yPos += 8;

    if (results.videos.length === 0) {
        doc.setFontSize(10);
        doc.text("No videos found.", 10, yPos);
    } else {
        doc.setFontSize(10);
        results.videos.forEach((video) => {
            if (yPos > 280) {
                doc.addPage();
                yPos = 20;
            }
            doc.setTextColor(79, 70, 229);
            doc.textWithLink(`• ${video.title}`, 10, yPos, { url: video.uri });
            yPos += 5;
            doc.setTextColor(100, 100, 100);
            doc.text(`  Source: ${video.source}`, 10, yPos);
            yPos += 8;
        });
    }

    doc.save(`PropertyReport_${mlsNumber}.pdf`);
  };

  const handleShare = async () => {
    if (!results) return;
    
    const shareData = {
        title: `Video Search Results: ${address.street}`,
        text: `I found ${results.videos.length} videos for ${address.street} (${address.city}).\n\nSummary: ${results.summary.substring(0, 100)}...`,
        url: window.location.href // Or deep link if app supported routing
    };

    if (navigator.share) {
        try {
            await navigator.share(shareData);
        } catch (err) {
            console.log("Error sharing:", err);
        }
    } else {
        // Fallback to email
        const subject = encodeURIComponent(shareData.title);
        const body = encodeURIComponent(`${shareData.text}\n\nView results in R.E.-Image2Vidz`);
        window.location.href = `mailto:?subject=${subject}&body=${body}`;
    }
  };

  const handleReset = () => {
    setAddress({ street: '', city: '', state: '', zip: '' });
    setMlsNumber('');
    setFrontImage(null);
    setBackImage(null);
    setResults(null);
    setError(null);
    setSaveStatus('idle');
  };

  const handleDeleteVideo = (index: number) => {
    if (!results) return;
    const updatedVideos = [...results.videos];
    updatedVideos.splice(index, 1);
    setResults({ ...results, videos: updatedVideos });
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
            <h1 className="text-xl font-bold text-slate-900 tracking-tight hidden sm:block">R.E.-Image2Vidz</h1>
            <h1 className="text-xl font-bold text-slate-900 tracking-tight sm:hidden">R.E.</h1>
          </div>
          <div className="flex items-center gap-3">
            {user ? (
                <div className="flex items-center gap-3">
                    <button 
                        onClick={loadHistory}
                        className="text-sm font-medium text-slate-600 hover:text-indigo-600 transition-colors hidden md:block"
                    >
                        My History
                    </button>
                    <div className="flex items-center gap-2 bg-slate-100 pl-3 pr-1 py-1 rounded-full">
                        <span className="text-xs font-semibold text-slate-700 max-w-[100px] truncate">
                            {user.displayName?.split(' ')[0]}
                        </span>
                        {user.photoURL ? (
                            <img src={user.photoURL} alt="User" className="w-7 h-7 rounded-full" />
                        ) : (
                            <div className="w-7 h-7 rounded-full bg-indigo-500 text-white flex items-center justify-center text-xs">
                                {user.email?.[0].toUpperCase()}
                            </div>
                        )}
                    </div>
                    <button 
                        onClick={handleLogout}
                        className="text-xs text-slate-500 hover:text-red-500 border-l border-slate-300 pl-3 ml-1"
                    >
                        Logout
                    </button>
                </div>
            ) : (
                <button
                    onClick={handleLogin}
                    className="flex items-center gap-2 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors"
                >
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M12.545,10.239v3.821h5.445c-0.712,2.315-2.647,3.972-5.445,3.972c-3.332,0-6.033-2.539-6.033-5.696  c0-3.159,2.701-5.698,6.033-5.698c1.6,0,3.046,0.575,4.172,1.52l2.766-2.753C17.788,3.992,15.343,3,12.544,3  C6.925,3,2.444,7.468,2.444,12.928c0,5.462,4.481,9.932,10.1,9.932c5.838,0,9.726-4.305,9.726-9.932  c0-0.621-0.057-1.226-0.165-1.815H12.545z"/></svg>
                    Sign In {(!auth) && "(Guest)"}
                </button>
            )}

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
                   {/* Actions Bar */}
                   <div className="flex flex-wrap gap-2 justify-end">
                        {user && (
                            <button 
                                onClick={handleSaveSearch}
                                disabled={saveStatus !== 'idle'}
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                                    saveStatus === 'saved' ? 'bg-green-50 text-green-700 border-green-200' : 
                                    saveStatus === 'error' ? 'bg-red-50 text-red-700 border-red-200' :
                                    'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'
                                }`}
                            >
                                {saveStatus === 'saved' ? (
                                    <>
                                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                                        Saved
                                    </>
                                ) : (
                                    <>
                                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" /></svg>
                                        Save
                                    </>
                                )}
                            </button>
                        )}
                        <button 
                            onClick={generatePDF}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-white text-slate-600 border border-slate-300 hover:bg-slate-50 transition-colors"
                        >
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                            Export PDF
                        </button>
                        <button 
                            onClick={handleShare}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-indigo-50 text-indigo-700 border border-indigo-100 hover:bg-indigo-100 transition-colors"
                        >
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" /></svg>
                            Share Results
                        </button>
                   </div>

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
                           <VideoResult 
                             key={idx} 
                             video={video} 
                             onDelete={() => handleDeleteVideo(idx)}
                           />
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

      {/* History Modal */}
      {showHistory && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={() => setShowHistory(false)}></div>
            <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden max-h-[90vh] flex flex-col">
                <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                    <h2 className="text-xl font-bold text-slate-900">Saved Searches</h2>
                    <button onClick={() => setShowHistory(false)} className="text-slate-400 hover:text-slate-600">
                        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>
                
                <div className="p-0 overflow-y-auto">
                    {historyError && (
                        <div className="bg-amber-50 p-3 text-xs text-amber-700 border-b border-amber-100 text-center">
                            {historyError}
                        </div>
                    )}
                    {loadingHistory ? (
                        <div className="p-8 text-center text-slate-500">Loading history...</div>
                    ) : historyList.length === 0 ? (
                        <div className="p-8 text-center text-slate-500">No saved searches found.</div>
                    ) : (
                        <div className="divide-y divide-slate-100">
                            {historyList.map((item) => (
                                <div key={item.id} onClick={() => restoreSearch(item)} className="p-4 hover:bg-slate-50 transition-colors flex justify-between items-center group cursor-pointer">
                                    <div className="flex-1 min-w-0 pr-4">
                                        {editingId === item.id ? (
                                            <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                                                <input
                                                    type="text"
                                                    value={editTitleValue}
                                                    onChange={(e) => setEditTitleValue(e.target.value)}
                                                    className="w-full px-2 py-1 text-sm border border-indigo-300 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                                    autoFocus
                                                />
                                                <button onClick={(e) => saveEdit(item.id!, e)} className="text-green-600 hover:text-green-800 p-1">
                                                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                                    </svg>
                                                </button>
                                                <button onClick={cancelEditing} className="text-red-500 hover:text-red-700 p-1">
                                                     <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                                    </svg>
                                                </button>
                                            </div>
                                        ) : (
                                            <>
                                                <div className="flex items-center gap-2">
                                                    <h4 className="font-medium text-slate-800 truncate">
                                                        {item.title || item.propertyDetails.street}
                                                    </h4>
                                                    <button 
                                                        onClick={(e) => startEditing(item, e)}
                                                        className="text-slate-400 hover:text-indigo-600 opacity-0 group-hover:opacity-100 transition-opacity p-1"
                                                        title="Edit Title"
                                                    >
                                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                                                        </svg>
                                                    </button>
                                                </div>
                                                <p className="text-xs text-slate-500 truncate">
                                                    {item.propertyDetails.city}, {item.propertyDetails.state} • {new Date(item.timestamp).toLocaleDateString()}
                                                </p>
                                            </>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-2">
                                        {item.userId === user.uid && (
                                            <button 
                                                onClick={(e) => handleShareSearchAccess(item, e)}
                                                className="text-slate-400 hover:text-indigo-600 opacity-0 group-hover:opacity-100 transition-opacity p-2 rounded-full hover:bg-indigo-50"
                                                title="Share with Email"
                                            >
                                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                                                </svg>
                                            </button>
                                        )}
                                        <button 
                                            className="text-sm text-indigo-600 hover:text-indigo-800 font-medium opacity-0 group-hover:opacity-100 transition-opacity"
                                        >
                                            Load
                                        </button>
                                        {item.userId === user.uid && (
                                            <button 
                                                onClick={(e) => handleDeleteSearch(item.id!, e)}
                                                className="text-slate-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity p-2 rounded-full hover:bg-red-50"
                                                title="Delete Search"
                                            >
                                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                </svg>
                                            </button>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
      )}

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
