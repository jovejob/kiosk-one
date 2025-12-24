import { useState, useEffect, useRef } from "react";
import "./App.css"; 

// --- FIREBASE IMPORTS ---
import { initializeApp } from "firebase/app";
import { 
  getStorage, 
  ref, 
  uploadBytes, 
  listAll, 
  getDownloadURL,
  deleteObject,
  getBytes 
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

// CURRENT APP VERSION
const APP_VERSION = "1.1"; 

const isVideo = (url) => url.match(/\.(mp4|webm|ogg|mov)/i);

function App() {
  const [mediaItems, setMediaItems] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [notification, setNotification] = useState(""); 
  
  const [isMuted, setIsMuted] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isUiVisible, setIsUiVisible] = useState(true);
  
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

    if(!isBackgroundRefresh && mediaItems.length === 0) setLoading(true);
    
    const folderPath = `images/${kioskId}/`;
    const listRef = ref(storage, folderPath);

    try {
      const response = await listAll(listRef);
      
      const newItems = await Promise.all(
        response.items.map(async (item) => {
          const url = await getDownloadURL(item);
          return {
            url: url,
            fullPath: item.fullPath, 
            name: item.name          
          };
        })
      );
      
      setMediaItems(prevItems => {
        if (prevItems.length !== newItems.length) return newItems;
        const isDifferent = prevItems.some((item, index) => item.url !== newItems[index].url);
        return isDifferent ? newItems : prevItems;
      });

    } catch (error) {
      console.error("Error fetching content:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (kioskId) fetchContent();
  }, [kioskId]);

  // --- 3. AUTO-REFRESH & VERSION CHECK ---
  useEffect(() => {
    if (!kioskId) return;

    const checkVersion = async () => {
      const versionRef = ref(storage, "images/common/version.json");
      try {
        const bytes = await getBytes(versionRef);
        const text = new TextDecoder().decode(bytes);
        const remoteData = JSON.parse(text);
        
        if (remoteData.version !== APP_VERSION) {
          console.log("New version detected! Reloading...");
          window.location.reload(true);
        }
      } catch (err) {
        // Ignore errors
      }
    };

    const interval = setInterval(() => {
      fetchContent(true); 
      checkVersion();     
    }, 120000); // 2 Minutes

    return () => clearInterval(interval);
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

    if (currentIndex >= mediaItems.length) {
      setCurrentIndex(0);
      return;
    }

    const currentItem = mediaItems[currentIndex];
    
    if (!isVideo(currentItem.url)) {
      const timer = setTimeout(() => nextSlide(), 5000); 
      return () => clearTimeout(timer);
    }

    if (isVideo(currentItem.url)) {
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

  const showToast = (msg) => { setNotification(msg); setTimeout(() => setNotification(""), 3000); };

  const handleDelete = async (fullPath) => {
    if (!window.confirm("Delete this file?")) return;
    const fileRef = ref(storage, fullPath);
    try {
      showToast("Deleting...");
      await deleteObject(fileRef);
      showToast("Deleted!");
      fetchContent(true); 
    } catch (error) {
      showToast("Error deleting.");
    }
  };

  const handleUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const storageRef = ref(storage, `images/${kioskId}/${file.name}`);
    try {
      showToast(`Uploading...`);
      await uploadBytes(storageRef, file);
      showToast("Success!");
      fetchContent(true); 
    } catch (err) { showToast("Error uploading."); }
  };

  return (
    <div className="kiosk-container">
      {notification && <div className="notification-toast">{notification}</div>}

      {/* --- CENTERED ADMIN OVERLAY --- */}
      {isUiVisible && (
        <div className="admin-overlay">
          <div className="admin-box">
            
            <div className="admin-header">
              <h3>Management: {kioskId}</h3>
              <button className="close-btn" onClick={() => setIsUiVisible(false)}>Close ✕</button>
            </div>
            
            <div className="admin-actions">
              <div className="upload-wrapper">
                 <label className="custom-file-upload">
                    Upload New Media
                    <input type="file" onChange={handleUpload} accept="image/*,video/*" />
                 </label>
              </div>

              <div className="button-group">
                <button 
                  className={`action-btn ${isMuted ? "muted" : "unmuted"}`}
                  onClick={toggleSound}
                >
                  {isMuted ? "🔇 Unmute" : "🔊 Mute"}
                </button>

                <button 
                  className="action-btn" 
                  onClick={toggleFullscreenAndUi}
                >
                  ⛶ Fullscreen & Hide
                </button>
              </div>
            </div>

            <div className="file-list-container">
              <h4>Current Playlist ({mediaItems.length})</h4>
              <div className="file-grid">
                {mediaItems.map((item) => (
                  <div key={item.fullPath} className="file-item">
                    
                    {/* THUMBNAIL */}
                    <div className="file-preview">
                      {isVideo(item.url) ? (
                         <video src={item.url} muted />
                      ) : (
                         <img src={item.url} alt="preview" />
                      )}
                    </div>

                    <span className="file-name">{item.name}</span>
                    
                    <button 
                      className="delete-btn" 
                      onClick={() => handleDelete(item.fullPath)}
                      title="Delete File"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            </div>
            
            <div className="admin-footer">
              <small>Ver: {APP_VERSION} | Auto-refresh: 2m</small>
            </div>

          </div>
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

      {mediaItems.map((item, index) => {
        const isActive = index === currentIndex;
        const _isVideo = isVideo(item.url);

        return (
          <div key={index} className={`slide ${isActive ? "active" : ""}`}>
            {_isVideo ? (
              <video
                ref={el => videoRefs.current[index] = el}
                src={item.url}
                muted={isMuted} 
                playsInline
                onEnded={nextSlide} 
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
              />
            ) : (
              <img src={item.url} alt={`Slide ${index}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

export default App;