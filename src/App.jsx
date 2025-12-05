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
  apiKey: import.meta.env.VITE_API_KEY,
  authDomain: import.meta.env.VITE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_APP_ID
};


const app = initializeApp(firebaseConfig);
const storage = getStorage(app);

const isVideo = (url) => url.match(/\.(mp4|webm|ogg|mov)/i);

function App() {
  const [mediaItems, setMediaItems] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [notification, setNotification] = useState(""); 
  
  const [isMuted, setIsMuted] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isUiVisible, setIsUiVisible] = useState(true);
  
  // Store the current Kiosk ID (folder name)
  const [kioskId, setKioskId] = useState(null); 

  const videoRefs = useRef([]);

  // --- 1. DETECT KIOSK ID ---
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const id = params.get("id") || "common";
    setKioskId(id);
  }, []);

  // --- 2. FETCH CONTENT ---
  const fetchContent = async (isBackgroundRefresh = false) => {
    if (!kioskId) return;

    // Only show loading spinner on the very first load
    if(!isBackgroundRefresh && mediaItems.length === 0) setLoading(true);
    
    const folderPath = `images/${kioskId}/`;
    const listRef = ref(storage, folderPath);

    try {
      const response = await listAll(listRef);
      const urls = await Promise.all(
        response.items.map((item) => getDownloadURL(item))
      );
      
      // Only update state if content actually changed
      setMediaItems(prevItems => {
        if (prevItems.length !== urls.length) return urls;
        const isDifferent = prevItems.some((url, index) => url !== urls[index]);
        return isDifferent ? urls : prevItems;
      });

    } catch (error) {
      console.error("Error fetching content:", error);
    } finally {
      setLoading(false);
    }
  };

  // Initial Fetch
  useEffect(() => {
    if (kioskId) fetchContent();
  }, [kioskId]);

  // --- 3. AUTO-REFRESH (POLLING) ---
  useEffect(() => {
    if (!kioskId) return;
    const refreshInterval = setInterval(() => {
      fetchContent(true); // Silent update
    }, 60000); // 60000 Seconds/ 1 minute
    return () => clearInterval(refreshInterval);
  }, [kioskId]);

  // --- 4. SLIDER LOGIC ---
  const nextSlide = () => {
    setCurrentIndex((prev) => {
      if (prev >= mediaItems.length - 1) return 0;
      return prev + 1;
    });
  };

  useEffect(() => {
    if (mediaItems.length === 0) return;

    // Safety check if playlist size changed
    if (currentIndex >= mediaItems.length) {
      setCurrentIndex(0);
      return;
    }

    const currentUrl = mediaItems[currentIndex];
    
    if (!isVideo(currentUrl)) {
      const timer = setTimeout(() => nextSlide(), 5000); 
      return () => clearTimeout(timer);
    }

    if (isVideo(currentUrl)) {
      const currentVideo = videoRefs.current[currentIndex];
      if (currentVideo) {
        currentVideo.currentTime = 0;
        currentVideo.muted = isMuted; 
        const playPromise = currentVideo.play();
        if (playPromise !== undefined) {
          playPromise.catch(error => console.log("Autoplay waiting"));
        }
      }
    }
  }, [currentIndex, mediaItems, isMuted]);

  // --- HELPER FUNCTIONS ---
  useEffect(() => {
    const handleFsChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", handleFsChange);
    return () => document.removeEventListener("fullscreenchange", handleFsChange);
  }, []);

  const toggleSound = () => {
    setIsMuted(!isMuted);
    const currentVideo = videoRefs.current[currentIndex];
    if (currentVideo) currentVideo.muted = !isMuted;
  };

  const toggleFullscreenAndUi = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch((e) => console.log(e));
    }
    setIsUiVisible(false);
  };

  const showUi = () => setIsUiVisible(true);

  // --- 5. UPLOAD LOGIC ---
  const showToast = (msg) => { setNotification(msg); setTimeout(() => setNotification(""), 3000); };
  const handleUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const storageRef = ref(storage, `images/${kioskId}/${file.name}`);
    try {
      showToast(`Uploading to ${kioskId}...`);
      await uploadBytes(storageRef, file);
      showToast("Success! Playlist will update shortly.");
      fetchContent(true); 
    } catch (err) { showToast("Error uploading."); }
  };

  return (
    <div className="kiosk-container">
      {notification && <div className="notification-toast">{notification}</div>}

      {isUiVisible && (
        <div className="admin-controls">
          <div className="admin-header">
            <h3>Admin: {kioskId}</h3>
            <button className="close-btn" onClick={() => setIsUiVisible(false)}>✕</button>
          </div>
          
          <div className="control-row">
            <input type="file" onChange={handleUpload} accept="image/*,video/*" />
          </div>

          <div className="control-row">
            <button 
              className={`sound-btn ${isMuted ? "muted" : "unmuted"}`}
              onClick={toggleSound}
            >
              {isMuted ? "🔇 Sound OFF" : "🔊 Sound ON"}
            </button>
          </div>

          <div className="control-row">
            <button 
              className={`sound-btn ${isFullscreen ? "muted" : "unmuted"}`}
              style={{ marginTop: "10px" }}
              onClick={toggleFullscreenAndUi}
            >
              ⛶ Fullscreen & Hide Menu
            </button>
          </div>
          <p style={{fontSize: "0.7rem", marginTop: "5px", opacity: 0.8}}>
            Auto-refresh active (15s)
          </p>
        </div>
      )}

      {!isUiVisible && (
        <button className="reopen-btn" onClick={showUi}>⚙️</button>
      )}

      {mediaItems.length === 0 && !loading && (
        <div className="empty-state">
          No content in "{kioskId}".<br/>
          Use the menu to upload.
        </div>
      )}

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