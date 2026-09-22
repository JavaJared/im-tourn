export async function prepareProfilePhoto(file) {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('Choose a JPG, PNG, or WebP image.');
  if (file.size > 10 * 1024 * 1024) throw new Error('Choose an image smaller than 10 MB.');
  const url = URL.createObjectURL(file);
  try {
    const image = await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('This image could not be opened. Choose another photo.'));
      img.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 512;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Photo editing is unavailable in this browser.');
    const side = Math.min(image.naturalWidth, image.naturalHeight);
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, 512, 512);
    ctx.drawImage(image, (image.naturalWidth - side) / 2, (image.naturalHeight - side) / 2, side, side, 0, 0, 512, 512);
    const preview = canvas.toDataURL('image/jpeg', .82);
    const photo = preview.split(',')[1];
    if (!photo || photo.length > 350000) throw new Error('This photo is too detailed. Choose a smaller image.');
    return { photo, preview };
  } finally { URL.revokeObjectURL(url); }
}
