import React, { useState, useRef, useCallback } from 'react';
import type { Track, Playlist } from '../../shared/types/track';
import { Disc, Image, X, Save } from 'lucide-react';
import './MetadataEditorModal.css';

interface MetadataEditorModalProps<T extends 'track' | 'playlist'> {
  type: T;
  item: T extends 'track' ? Track : Playlist;
  isOpen: boolean;
  onClose: () => void;
  onSave: (updated: T extends 'track' ? Partial<Track> : Partial<Playlist>, coverDataUrl?: string | null) => Promise<boolean>;
}

export function MetadataEditorModal<T extends 'track' | 'playlist'>({
  type,
  item,
  isOpen,
  onClose,
  onSave
}: MetadataEditorModalProps<T>) {
  const isTrack = type === 'track';
  const track = isTrack ? (item as Track) : null;
  const playlist = !isTrack ? (item as Playlist) : null;

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [cover, setCover] = useState<string | null>((track?.coverArt || playlist?.coverUrl || null) as string | null);
  const [title, setTitle] = useState(track?.title ?? playlist?.name ?? '');
  const [artist, setArtist] = useState(track?.artist ?? '');
  const [album, setAlbum] = useState(track?.album ?? '');
  const [year, setYear] = useState(track?.year?.toString() ?? '');
  const [trackNumber, setTrackNumber] = useState(track?.trackNumber?.toString() ?? '');
  const [genre, setGenre] = useState(track?.genre ?? '');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleYearChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    if (val === '' || (/^\d+$/.test(val) && val.length <= 4)) {
      setYear(val);
      setError(null);
    }
  };

  const handleTrackNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    if (val === '' || /^\d+$/.test(val)) {
      setTrackNumber(val);
      setError(null);
    }
  };

  const handleSelectImage = async () => {
    if (window.electronAPI?.selectImageFile) {
      const result = await window.electronAPI.selectImageFile();
      if (result?.dataUrl) setCover(result.dataUrl);
    } else {
      fileInputRef.current?.click();
    }
  };

  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setCover(ev.target?.result as string);
    reader.readAsDataURL(file);
  }, []);

  const handleSave = async () => {
    setError(null);
    if (isTrack) {
      if (!title.trim()) {
        setError('O título é obrigatório.');
        return;
      }
      if (!artist.trim()) {
        setError('O artista é obrigatório.');
        return;
      }
      if (year && !/^\d{4}$/.test(year)) {
        setError('O ano deve conter exatamente 4 dígitos.');
        return;
      }
    } else {
      if (!title.trim()) {
        setError('O nome da playlist é obrigatório.');
        return;
      }
    }

    setIsSaving(true);
    try {
      const coverChanged = cover !== (track?.coverArt ?? playlist?.coverUrl ?? null);
      const coverToSend = coverChanged ? cover : undefined;

      const payload = isTrack
        ? {
            title: title.trim(),
            artist: artist.trim(),
            album: album.trim(),
            year: year ? parseInt(year, 10) : null,
            trackNumber: trackNumber ? parseInt(trackNumber, 10) : null,
            genre: genre.trim() || null,
            ...(coverChanged ? { coverArt: cover } : {})
          }
        : {
            name: title.trim(),
            ...(coverChanged ? { coverUrl: cover } : {})
          };

      const ok = await onSave(payload as T extends 'track' ? Partial<Track> : Partial<Playlist>, coverToSend);
      if (ok) {
        onClose();
      } else {
        setError('Erro ao salvar as alterações no banco ou arquivo.');
      }
    } catch (err: any) {
      setError(err.message || 'Ocorreu um erro ao salvar os metadados.');
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen || !item) return null;

  const isSaveDisabled = isSaving || !title.trim() || (isTrack && !artist.trim());

  return (
    <div className="system-modal-overlay meta-editor-overlay" onClick={onClose}>
      <div className="system-modal-container meta-editor-container" onClick={e => e.stopPropagation()}>
        <button className="meta-editor-close" onClick={onClose} aria-label="Fechar">
          <X size={20} />
        </button>
        <div className="system-modal-title">{isTrack ? 'Editar música' : 'Editar playlist'}</div>

        <div className="meta-editor-cover" onClick={handleSelectImage}>
          {cover ? (
            <img src={cover} alt="Capa" className="meta-editor-cover-img" />
          ) : (
            <div className="meta-editor-cover-placeholder">
              <Disc size={48} color="#727272" />
            </div>
          )}
          <div className="meta-editor-cover-overlay">
            <Image size={24} />
            <span>Alterar capa</span>
          </div>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          onChange={handleFileChange}
        />

        {error && <div className="meta-editor-error">{error}</div>}

        <div className="meta-editor-fields">
          <label>{isTrack ? 'Título *' : 'Nome *'}</label>
          <input className="system-modal-input" value={title} onChange={e => { setTitle(e.target.value); setError(null); }} />

          {isTrack && (
            <>
              <label>Artista *</label>
              <input className="system-modal-input" value={artist} onChange={e => { setArtist(e.target.value); setError(null); }} />

              <label>Álbum</label>
              <input className="system-modal-input" value={album} onChange={e => setAlbum(e.target.value)} />

              <div className="meta-editor-row">
                <div>
                  <label>Ano</label>
                  <input className="system-modal-input" type="text" pattern="[0-9]*" inputMode="numeric" value={year} onChange={handleYearChange} placeholder="Ex: 2026" />
                </div>
                <div>
                  <label>Faixa</label>
                  <input className="system-modal-input" type="text" pattern="[0-9]*" inputMode="numeric" value={trackNumber} onChange={handleTrackNumberChange} placeholder="Ex: 1" />
                </div>
              </div>

              <label>Gênero</label>
              <input className="system-modal-input" value={genre} onChange={e => setGenre(e.target.value)} />
            </>
          )}
        </div>

        <div className="system-modal-actions">
          <button className="system-modal-btn secondary" onClick={onClose} disabled={isSaving}>Cancelar</button>
          <button className="system-modal-btn primary" onClick={handleSave} disabled={isSaveDisabled}>
            <Save size={16} className="meta-editor-save-icon" />
            {isSaving ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      </div>
    </div>
  );
}
