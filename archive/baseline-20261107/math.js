/* Shared column-major matrix helpers. */
window.CosmosMath=(()=>{
    function mat4Perspective(out, fovy, aspect, near, far) {
      const f = 1.0 / Math.tan(fovy / 2);
      out[0] = f / aspect; out[1] = 0; out[2] = 0; out[3] = 0;
      out[4] = 0; out[5] = f; out[6] = 0; out[7] = 0;
      out[8] = 0; out[9] = 0; out[10] = (far + near) / (near - far); out[11] = -1;
      out[12] = 0; out[13] = 0; out[14] = (2 * far * near) / (near - far); out[15] = 0;
      return out;
    }

    function mat4LookAt(out, eye, center, up) {
      let z0 = eye[0] - center[0], z1 = eye[1] - center[1], z2 = eye[2] - center[2];
      let len = 1.0 / Math.hypot(z0, z1, z2);
      z0 *= len; z1 *= len; z2 *= len;

      let x0 = up[1] * z2 - up[2] * z1, x1 = up[2] * z0 - up[0] * z2, x2 = up[0] * z1 - up[1] * z0;
      len = 1.0 / Math.hypot(x0, x1, x2);
      x0 *= len; x1 *= len; x2 *= len;

      let y0 = z1 * x2 - z2 * x1, y1 = z2 * x0 - z0 * x2, y2 = z0 * x1 - z1 * x0;

      out[0] = x0; out[1] = y0; out[2] = z0; out[3] = 0;
      out[4] = x1; out[5] = y1; out[6] = z1; out[7] = 0;
      out[8] = x2; out[9] = y2; out[10] = z2; out[11] = 0;
      out[12] = -(x0 * eye[0] + x1 * eye[1] + x2 * eye[2]);
      out[13] = -(y0 * eye[0] + y1 * eye[1] + y2 * eye[2]);
      out[14] = -(z0 * eye[0] + z1 * eye[1] + z2 * eye[2]);
      out[15] = 1;
      return out;
    }

    function mat4Multiply(out, a, b) {
      let a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3];
      let a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7];
      let a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11];
      let a30 = a[12], a31 = a[13], a32 = a[14], a33 = a[15];

      let b0 = b[0], b1 = b[1], b2 = b[2], b3 = b[3];
      out[0] = b0*a00 + b1*a10 + b2*a20 + b3*a30;
      out[1] = b0*a01 + b1*a11 + b2*a21 + b3*a31;
      out[2] = b0*a02 + b1*a12 + b2*a22 + b3*a32;
      out[3] = b0*a03 + b1*a13 + b2*a23 + b3*a33;

      b0 = b[4]; b1 = b[5]; b2 = b[6]; b3 = b[7];
      out[4] = b0*a00 + b1*a10 + b2*a20 + b3*a30;
      out[5] = b0*a01 + b1*a11 + b2*a21 + b3*a31;
      out[6] = b0*a02 + b1*a12 + b2*a22 + b3*a32;
      out[7] = b0*a03 + b1*a13 + b2*a23 + b3*a33;

      b0 = b[8]; b1 = b[9]; b2 = b[10]; b3 = b[11];
      out[8] = b0*a00 + b1*a10 + b2*a20 + b3*a30;
      out[9] = b0*a01 + b1*a11 + b2*a21 + b3*a31;
      out[10] = b0*a02 + b1*a12 + b2*a22 + b3*a32;
      out[11] = b0*a03 + b1*a13 + b2*a23 + b3*a33;

      b0 = b[12]; b1 = b[13]; b2 = b[14]; b3 = b[15];
      out[12] = b0*a00 + b1*a10 + b2*a20 + b3*a30;
      out[13] = b0*a01 + b1*a11 + b2*a21 + b3*a31;
      out[14] = b0*a02 + b1*a12 + b2*a22 + b3*a32;
      out[15] = b0*a03 + b1*a13 + b2*a23 + b3*a33;
      return out;
    }
function scanEvents(nodes,matrix,from,to,mode=0,lens=1,time=0) {
  const scale=[130.81,146.83,164.81,196,220,261.63,293.66,329.63,392,440,523.25];
  const result=[];
  nodes.forEach(([ox,oy,z],index)=>{
    let x=ox,y=oy;
    if(mode>.5&&mode<1.5){const factor=1+lens*.4/(1+Math.hypot(x,y)*.08);x*=factor;y*=factor;}
    const w=matrix[3]*x+matrix[7]*y+matrix[11]*z+matrix[15];if(w<=0)return;
    const sx=(matrix[0]*x+matrix[4]*y+matrix[8]*z+matrix[12])/w*.5+.5;
    const sy=.5-(matrix[1]*x+matrix[5]*y+matrix[9]*z+matrix[13])/w*.5;
    const crossed=from<=to?sx>from&&sx<=to:sx>from||sx<=to;
    if(sx<0||sx>1||sy<0||sy>1||!crossed)return;
    const note=Math.max(0,Math.min(scale.length-1,Math.floor((1-sy)*scale.length)));
    result.push({index,x:sx,y:sy,pan:sx*2-1,frequency:scale[note],intensity:(Math.sin(time*3.5+x*2.5)*.25+1)/1.25});
  });
  return result;
}
return {mat4Perspective,mat4LookAt,mat4Multiply,scanEvents};})();
