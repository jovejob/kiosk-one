import { useState, useEffect, useRef } from "react";
import "./App.css"; 

// --- FIREBASE IMPORTS ---
import { initializeApp } from "firebase/app";
import { 
  getStorage, 
  ref, 
  uploadBytes, 
  listAll, 
  getDownloadURL 
} from "firebase/storage";

// --- CONFIG ---
const firebaseConfig = {
  apiKey: "AIzaSyBVAHBrabFCmiJ57WGeNgJMN8j1M-kCMFk",
  authDomain: "kiosk-one-680a8.firebaseapp.com",
  projectId: "kiosk-one-680a8",
  storageBucket: "kiosk-one-680a8.firebasestorage.app",
  messagingSenderId: "474624398124",
  appId: "1:474624398124:web:d721001fd5f43a180f9289"
};

const app = initializeApp(firebaseConfig);
const storage = getStorage(app);

// Helper to check if URL is a video
const isVideo = (url) => url.match(/\.(mp4|webm|ogg|mov)/i);

function App() {
  const [mediaItems, setMediaItems] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [notification, setNotification] = useState(""); 
  
  // STATE 1: Muted (Default TRUE)
  const [isMuted, setIsMuted] = useState(true);
  
  // STATE 2: Fullscreen (Default FALSE)
  const [isFullscreen, setIsFullscreen] = useState(false);

  const videoRefs = useRef([]);

  // --- 1. FETCH CONTENT ---
  const fetchContent = async () => {
    if(mediaItems.length === 0) setLoading(true);
    const listRef = ref(storage, "kiosk-one/");
    try {
      const response = await listAll(listRef);
      const urls = await Promise.all(
        response.items.map((item) => getDownloadURL(item))
      );
      setMediaItems(urls);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchContent();
  }, []);

  // --- 2. SLIDER LOGIC ---
  const nextSlide = () => {
    setCurrentIndex((prev) => (prev === mediaItems.length - 1 ? 0 : prev + 1));
  };

  useEffect(() => {
    if (mediaItems.length === 0) return;

    const currentUrl = mediaItems[currentIndex];
    
    // IMAGE LOGIC
    if (!isVideo(currentUrl)) {
      const timer = setTimeout(() => nextSlide(), 5000); 
      return () => clearTimeout(timer);
    }

    // VIDEO LOGIC
    if (isVideo(currentUrl)) {
      const currentVideo = videoRefs.current[currentIndex];
      if (currentVideo) {
        currentVideo.currentTime = 0;
        currentVideo.muted = isMuted; 
        
        const playPromise = currentVideo.play();
        if (playPromise !== undefined) {
          playPromise.catch(error => console.log("Autoplay waiting for interaction"));
        }
      }
    }
  }, [currentIndex, mediaItems, isMuted]);

  // --- 3. HELPER: Listen for Fullscreen Changes ---
  // This ensures the state is correct even if user presses "Esc" or swipes back
  useEffect(() => {
    const handleFsChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener("fullscreenchange", handleFsChange);
    return () => document.removeEventListener("fullscreenchange", handleFsChange);
  }, []);

  const toggleSound = () => {
    setIsMuted(!isMuted);
    const currentVideo = videoRefs.current[currentIndex];
    if (currentVideo) currentVideo.muted = !isMuted;
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch((err) => {
        console.error(`Error enabling fullscreen: ${err.message}`);
      });
    } else {
      if (document.exitFullscreen) document.exitFullscreen();
    }
  };

  // --- 4. UPLOAD LOGIC ---
  const showToast = (msg) => { setNotification(msg); setTimeout(() => setNotification(""), 3000); };
  const handleUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const storageRef = ref(storage, `kiosk-one/${file.name}`);
    try {
      showToast("Uploading...");
      await uploadBytes(storageRef, file);
      showToast("Success! Refreshing...");
      fetchContent();
    } catch (err) { showToast("Error uploading."); }
  };

  return (
    <div className="kiosk-container">
      {notification && <div className="notification-toast">{notification}</div>}

      {/* ONLY SHOW ADMIN CONTROLS IF NOT FULLSCREEN 
         (This hides the whole box when you enter play mode)
      */}
      {!isFullscreen && (
        <div className="admin-controls">
          <h3>Admin Controls</h3>
          
          {/* FILE UPLOAD */}
          <div className="control-row">
            <input type="file" onChange={handleUpload} accept="image/*,video/*" />
          </div>

          {/* SOUND TOGGLE BUTTON */}
          <div className="control-row">
            <button 
              className={`sound-btn ${isMuted ? "muted" : "unmuted"}`}
              onClick={toggleSound}
            >
              {isMuted ? "🔇 Sound OFF" : "🔊 Sound ON"}
            </button>
          </div>

          {/* FULLSCREEN BUTTON */}
          <div className="control-row">
            <button 
              className={`sound-btn ${isFullscreen ? "muted" : "unmuted"}`}
              style={{ marginTop: "10px" }}
              onClick={toggleFullscreen}
            >
              {/* Note: This text technically won't be seen often because the box hides when true,
                  but it is good logic to have if you change your mind later. */}
              {isFullscreen ? "⛶ Exit Fullscreen" : "⛶ Enter Fullscreen"}
            </button>
          </div>
          
          <p style={{fontSize: "0.8rem", marginTop: "10px", opacity: 0.8}}>
            * Controls hide in fullscreen. Swipe Back to exit.
          </p>
        </div>
      )}

      {mediaItems.length === 0 && !loading && <div className="empty-state">No content found.</div>}

      {mediaItems.map((url, index) => {
        const isActive = index === currentIndex;
        const _isVideo = isVideo(url);

        return (
          <div key={index} className={`slide ${isActive ? "active" : ""}`}>
            {_isVideo ? (
              <video
                ref={el => videoRefs.current[index] = el}
                src={url}
                muted={isMuted} 
                playsInline
                onEnded={nextSlide} 
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
              />
            ) : (
              <img src={url} alt={`Slide ${index}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

export default App;