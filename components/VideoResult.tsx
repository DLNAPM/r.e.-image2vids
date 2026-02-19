import React from 'react';
import { VideoSearchResult } from '../types';

interface VideoResultProps {
  video: VideoSearchResult;
}

const VideoResult: React.FC<VideoResultProps> = ({ video }) => {
  const isYoutube = video.source.includes('youtube') || video.source.includes('youtu.be');
  const isVimeo = video.source.includes('vimeo');
  
  let iconColor = "bg-slate-100 text-slate-500";
  if (isYoutube) iconColor = "bg-red-100 text-red-600";
  if (isVimeo) iconColor = "bg-sky-100 text-sky-600";

  return (
    <a 
      href={video.uri} 
      target="_blank" 
      rel="noopener noreferrer"
      className="flex items-start p-4 bg-white rounded-xl shadow-sm border border-slate-100 hover:shadow-md hover:border-slate-300 transition-all duration-200 group"
    >
      <div className={`flex-shrink-0 w-12 h-12 rounded-lg ${iconColor} flex items-center justify-center mr-4`}>
        {isYoutube ? (
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M19.615 3.184c-3.604-.246-11.631-.245-15.23 0-3.897.266-4.356 2.62-4.385 8.816.029 6.185.484 8.549 4.385 8.816 3.6.245 11.626.246 15.23 0 3.897-.266 4.356-2.62 4.385-8.816-.029-6.185-.484-8.549-4.385-8.816zm-10.615 12.816v-8l8 3.993-8 4.007z"/></svg>
        ) : isVimeo ? (
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M22.875 10.098c-.286 6.276-4.706 13.064-9.358 13.064-2.83 0-5.231-5.187-5.231-7.859 0-1.742.613-3.376 1.765-5.257-2.735 1.455-5.462 4.545-6.051 4.545-.331 0-.584-.667-.346-1.579.919-3.52 1.838-7.042 2.756-10.562 1.259-4.47 3.824-3.504 3.737-.306-.062 2.222-1.353 5.378-1.077 5.923.385.761 2.37-3.042 2.822-4.103.882-2.071 4.588-3.342 5.867 1.348l5.116 4.786z"/></svg>
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
  );
};

export default VideoResult;
