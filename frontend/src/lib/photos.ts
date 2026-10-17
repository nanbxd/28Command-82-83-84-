/** Resize camera photos before transfer. The server still validates every image. */
export async function preparePhoto(file: File): Promise<File> {
  if (file.size > 8 * 1024 * 1024) throw new Error('Максимальный размер исходного файла — 8 МБ.');
  let picture: ImageBitmap;
  try { picture = await createImageBitmap(file); }
  catch { throw new Error('Не удалось прочитать фото. Выберите JPEG, PNG или WebP.'); }
  try {
    if (picture.width * picture.height > 20_000_000) throw new Error('Выберите фотографию до 20 мегапикселей.');
    const scale = Math.min(1, 2048 / Math.max(picture.width, picture.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(picture.width * scale));
    canvas.height = Math.max(1, Math.round(picture.height * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Не удалось подготовить фото. Обновите страницу и попробуйте снова.');
    context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(picture, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error('Не удалось подготовить фото. Попробуйте другой файл.')), 'image/jpeg', 0.82));
    if (scale === 1 && blob.size >= file.size) return file;
    return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' });
  } finally { picture.close(); }
}
