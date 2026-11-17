/**
 * Independent orthographic camera with a physical tilt and optional cinematic
 * crop. Default zoom=1 always fits all 88 keys; follow-focus is opt-in.
 * The same transform is used for mouse-to-key mapping and rendering.
 */
import {orthographic,lookAt,mul4} from './math3d.js?v=dynamic16h';
export const CAMERA_TILT_RATIO=.27;
export function stageCamera(width,height,keyboardWidth,hitY=-.81,frontY=-2.27,options={}){
  const aspect=Math.max(.35,Math.max(1,width)/Math.max(1,height));
  const portrait=height>width;
  const zoom=Math.max(1,Math.min(2.1,Number(options.zoom)||1));
  const tilt=Math.max(0,Math.min(.65,options.tilt??CAMERA_TILT_RATIO));
  const baseWidth=Math.max(13.35,keyboardWidth+.95,(hitY-frontY)*aspect/.22);
  // Portrait lookahead may request a world-unit width instead of a static zoom.
  // Landscape behavior remains unchanged when no explicit width is supplied.
  const requested=Number(options.visibleWidth);
  const visibleWidth=Number.isFinite(requested)&&requested>0
    ? Math.max(Math.max(3.9,6.2*aspect),Math.min(keyboardWidth+.95,requested))
    : baseWidth/zoom;
  const visibleHeight=visibleWidth/aspect;
  const cosTilt=1/Math.sqrt(1+tilt*tilt);
  // Portrait needs a small *physical* margin. The old .995 target put the
  // front edge exactly at the crop boundary and clipped the keyboard case
  // (which extends beyond FRONT_Y). Keep the whole playable surface visible.
  const defaultStrikeScreenY=.76;
  const desiredFrontScreenY=portrait?.95:defaultStrikeScreenY+(hitY-frontY)*cosTilt/visibleHeight;
  const strikeScreenY=portrait
    ? Math.max(.58,Math.min(.9,desiredFrontScreenY-(hitY-frontY)*cosTilt/visibleHeight))
    : defaultStrikeScreenY;
  const centerY=portrait
    ? frontY+(desiredFrontScreenY-.5)*visibleHeight/cosTilt
    : hitY+(strikeScreenY-.5)*visibleHeight/cosTilt;
  const viewMargin=Number.isFinite(requested)&&requested>0
    ? visibleWidth/2-.38 : visibleWidth*.45;
  const maxFocus=Math.max(0,keyboardWidth/2-viewMargin);
  const focusX=Math.max(-maxFocus,Math.min(maxFocus,options.focusX||0));
  const projection=orthographic(-visibleWidth/2,visibleWidth/2,-visibleHeight/2,visibleHeight/2,.1,100);
  const cameraZ=24;
  const view=lookAt([focusX,centerY-cameraZ*tilt,cameraZ],[focusX,centerY,0]);
  return {matrix:mul4(projection,view),visibleWidth,visibleHeight,centerY,focusX,zoom,tilt,
    keyFraction:keyboardWidth/visibleWidth,strikeScreenY,
    frontScreenY:portrait?desiredFrontScreenY:strikeScreenY+(hitY-frontY)*cosTilt/visibleHeight};
}

/** Match a portrait note's travel distance to the *current camera* viewport.
 * The old fixed 5.1-world-unit fall starts halfway down a zoomed Shorts frame.
 * Preserve the original distance for landscape output.
 */
export function noteFallLane(camera,seconds,portrait=false,hitY=-.81){
  const duration=Math.max(.1,Number(seconds)||2.8);
  const cosTilt=1/Math.sqrt(1+camera.tilt*camera.tilt);
  const distance=portrait?camera.strikeScreenY*camera.visibleHeight/cosTilt:5.1;
  return {speed:distance/duration,roof:portrait?hitY+distance+.15:5.4};
}
