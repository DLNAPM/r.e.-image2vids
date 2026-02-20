
import React from 'react';
import { VideoSearchResult } from '../types';

interface VideoResultProps {
  video: VideoSearchResult;
  onDelete: () => void;
}

const VideoResult: React.FC<VideoResultProps> = ({ video, onDelete }) => {
  const isYoutube = video.source.includes('youtube') || video.source.includes('youtu.be');
  const isVimeo = video.source.includes('vimeo');
  const isInstagram = video.source.includes('instagram');
  
  let iconColor = "bg-slate-100 text-slate-500";
  if (isYoutube) iconColor = "bg-red-100 text-red-600";
  if (isVimeo) iconColor = "bg-sky-100 text-sky-600";
  if (isInstagram) iconColor = "bg-pink-100 text-pink-600";

  return (
    <div className="relative group bg-white rounded-xl shadow-sm border border-slate-100 hover:shadow-md hover:border-slate-300 transition-all duration-200">
      <a 
        href={video.uri} 
        target="_blank" 
        rel="noopener noreferrer"
        className="flex items-start p-4 w-full h-full"
      >
        <div className={`flex-shrink-0 w-12 h-12 rounded-lg ${iconColor} flex items-center justify-center mr-4`}>
          {isYoutube ? (
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M19.615 3.184c-3.604-.246-11.631-.245-15.23 0-3.897.266-4.356 2.62-4.385 8.816.029 6.185.484 8.549 4.385 8.816 3.6.245 11.626.246 15.23 0 3.897-.266 4.356-2.62 4.385-8.816-.029-6.185-.484-8.549-4.385-8.816zm-10.615 12.816v-8l8 3.993-8 4.007z"/></svg>
          ) : isVimeo ? (
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M22.875 10.098c-.286 6.276-4.706 13.064-9.358 13.064-2.83 0-5.231-5.187-5.231-7.859 0-1.742.613-3.376 1.765-5.257-2.735 1.455-5.462 4.545-6.051 4.545-.331 0-.584-.667-.346-1.579.919-3.52 1.838-7.042 2.756-10.562 1.259-4.47 3.824-3.504 3.737-.306-.062 2.222-1.353 5.378-1.077 5.923.385.761 2.37-3.042 2.822-4.103.882-2.071 4.588-3.342 5.867 1.348l5.116 4.786z"/></svg>
          ) : isInstagram ? (
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/></svg>
          ) : (
               <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>
          )}
        </div>
        <div className="flex-grow min-w-0">
          <h3 className="text-sm font-semibold text-slate-900 group-hover:text-blue-600 truncate mb-1">
            {video.title}
          </h3>
          <p className="text-xs text-slate-500 mb-2 truncate">
            {video.source}
          </p>
          <div className="flex items-center text-xs text-blue-500 font-medium">
            View Video
            <svg className="w-3 h-3 ml-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
            </svg>
          </div>
        </div>
      </a>
      <button
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onDelete();
        }}
        className="absolute top-2 right-2 p-1.5 bg-white/90 rounded-full text-slate-400 hover:text-red-500 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-all shadow-sm border border-slate-100"
        title="Remove video"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
        </svg>
      </button>
    </div>
  );
};

export default VideoResult;
