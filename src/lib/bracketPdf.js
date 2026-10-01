// A single image-backed PDF page, preserving the bracket export's exact layout.
export function bracketPdf(jpeg, width, height) {
  if(!(jpeg instanceof Uint8Array)||!jpeg.length||!Number.isFinite(width)||!Number.isFinite(height)||width<=0||height<=0)throw new Error('Invalid bracket image.');
  const encode=value=>new TextEncoder().encode(value);
  const scale=Math.min(1,14000/Math.max(width,height));
  const w=(width*scale).toFixed(2),h=(height*scale).toFixed(2);
  const chunks=[],offsets=[0];let size=0;
  const add=value=>{const bytes=typeof value==='string'?encode(value):value;chunks.push(bytes);size+=bytes.length;};
  const object=(id,body)=>{offsets[id]=size;add(`${id} 0 obj\n${body}\nendobj\n`);};
  add('%PDF-1.4\n');
  object(1,'<< /Type /Catalog /Pages 2 0 R >>');
  object(2,'<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
  object(3,`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${w} ${h}] /Resources << /XObject << /Image 4 0 R >> >> /Contents 5 0 R >>`);
  offsets[4]=size;
  add(`4 0 obj\n<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`);
  add(jpeg);add('\nendstream\nendobj\n');
  const commands=`q ${w} 0 0 ${h} 0 0 cm /Image Do Q\n`;
  object(5,`<< /Length ${encode(commands).length} >>\nstream\n${commands}endstream`);
  const xref=size;
  add('xref\n0 6\n0000000000 65535 f \n');
  for(let i=1;i<=5;i++)add(`${String(offsets[i]).padStart(10,'0')} 00000 n \n`);
  add(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  return new Blob(chunks,{type:'application/pdf'});
}
