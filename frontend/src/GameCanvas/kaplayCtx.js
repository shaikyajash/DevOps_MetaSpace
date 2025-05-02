import kaplay from "kaplay";

// Use a singleton pattern to ensure only one kaplay instance
let kaplayInstance = null;

const initKaplay = () => {
  if (kaplayInstance) {
    return kaplayInstance;
  }
  
  const canvas = document.getElementById("game");
  if (!canvas) {
    console.error("Game canvas not found!");
    return null;
  }
  
  // Calculate responsive dimensions based on the viewport
  const calculateDimensions = () => {
    const canvasContainer = canvas.parentElement;
    if (!canvasContainer) return { width: 1080, height: 720 };
    
    // Get available container space
    const containerWidth = canvasContainer.clientWidth;
    const containerHeight = canvasContainer.clientHeight;
    
    // Keep aspect ratio 3:2 (similar to 1080:720)
    const aspectRatio = 3/2;
    
    let width, height;
    
    // Determine dimensions based on available space
    if (containerWidth / containerHeight > aspectRatio) {
      // Container is wider than needed - constrain by height
      height = Math.min(containerHeight, 720);
      width = height * aspectRatio;
    } else {
      // Container is taller than needed - constrain by width
      width = Math.min(containerWidth, 1080);
      height = width / aspectRatio;
    }
    
    return {
      width: Math.floor(width),
      height: Math.floor(height)
    };
  };
  
  const dimensions = calculateDimensions();
  
  // Initialize kaplay with responsive dimensions
  kaplayInstance = kaplay({
    width: dimensions.width,
    height: dimensions.height,
    canvas: canvas,
    global: false,
    debug: true,
    debugKey: "f2",
    fps: 60,
    pixelDensity: devicePixelRatio,
    background: "#0F172A", 
  });
  
  // Handle window resize
  const handleResize = () => {
    const newDimensions = calculateDimensions();
    if (kaplayInstance) {
      kaplayInstance.resize(newDimensions.width, newDimensions.height);
    }
  };
  
  window.addEventListener("resize", handleResize);
  
  return kaplayInstance;
};

export default initKaplay;