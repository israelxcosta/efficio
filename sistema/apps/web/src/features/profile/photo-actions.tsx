import { useState } from 'react';
import { Camera } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/features/auth/auth-context';
import { checkImageFile, imageUrlToDataUrl, pickImage, readAsDataUrl } from '@/lib/image';
import { toastError } from '@/lib/notify';
import { loadPhoto } from '@/lib/photo-cache';
import { useRemovePhoto, useUploadPhoto } from './api';
import { PhotoCropDialog } from './photo-crop-dialog';

/** Up to 5 MB to pick; the crop sends 256×256 WebP (spec §15.3). */
const MAX_PICK_BYTES = 5 * 1024 * 1024;

/** "Enviar foto" / "Trocar foto" and "Remover foto" of the profile card. */
export function ProfilePhotoActions() {
  const { user } = useAuth();
  const upload = useUploadPhoto();
  const remove = useRemovePhoto();
  const [source, setSource] = useState<string | null>(null);
  const hasPhoto = Boolean(user?.photoUpdatedAt);

  async function choose() {
    const file = await pickImage();
    if (!file) return;
    const check = checkImageFile(file, MAX_PICK_BYTES, 'A imagem passa de 5 MB.');
    if (!check.ok) {
      toast.error(check.error);
      return;
    }
    setSource(await readAsDataUrl(file));
  }

  async function save(photo: string) {
    try {
      await upload.mutateAsync(photo);
      upload.reset();
      setSource(null);
      toast.success('Foto atualizada.');
    } catch (error) {
      toastError(error);
    }
  }

  async function removePhoto() {
    if (!user?.photoUpdatedAt) return;
    // The current image, to put it back with "Desfazer" (no confirmation, spec §15.3).
    const url = await loadPhoto(user.id, user.photoUpdatedAt);
    const previous = url ? await imageUrlToDataUrl(url) : null;
    try {
      await remove.mutateAsync();
      toast.success('Foto removida.', {
        action: previous
          ? { label: 'Desfazer', onClick: () => void upload.mutateAsync(previous).then(() => toast.success('Foto restaurada.')).catch(toastError) }
          : undefined,
      });
    } catch (error) {
      toastError(error);
    }
  }

  return (
    <div className="flex flex-wrap gap-2">
      <Button type="button" variant="outline" size="sm" onClick={() => void choose()}>
        <Camera /> {hasPhoto ? 'Trocar foto' : 'Enviar foto'}
      </Button>
      {hasPhoto ? (
        <Button type="button" variant="ghost" size="sm" loading={remove.isPending} onClick={() => void removePhoto()}>
          Remover foto
        </Button>
      ) : null}
      <PhotoCropDialog source={source} saving={upload.isPending} onCancel={() => setSource(null)} onSave={(p) => void save(p)} />
    </div>
  );
}
