/**
 * OPS SIGAP — Unified Media Gallery
 */

import React, { useEffect, useState } from 'react';
import {
  Image as ImageIcon,
  ArrowLeft,
  Filter,
  MapPin,
  Clock,
  Download,
  X,
  Shield,
  FileText,
  AlertTriangle,
} from 'lucide-react';
import { api } from '../lib/api';
import { MediaGalleryItem } from '../types/ops';

export const GalleryView: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const [mediaList, setMediaList] = useState<MediaGalleryItem[]>([]);
  const [activeFilter, setActiveFilter] = useState<'SEMUA' | 'PATROL' | 'HANDOVER' | 'INCIDENT'>('SEMUA');
  const [selectedItem, setSelectedItem] = useState<MediaGalleryItem | null>(null);
  const [loading, setLoading] = useState(true);

  const loadMedia = async () => {
    try {
      const filterParam = activeFilter === 'SEMUA' ? undefined : { sourceModule: activeFilter };
      const res = await api.getGallery(filterParam);
      if (res.success) {
        setMediaList(res.media);
      }
    } catch (err) {
      console.warn('Failed to load media:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMedia();
  }, [activeFilter]);

  const handleDownload = (item: MediaGalleryItem) => {
    const a = document.createElement('a');
    a.href = item.photoUrl;
    a.download = `SIGAP-${item.sourceModule}-${item.sourceId}.jpg`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 pb-24">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-slate-900/95 backdrop-blur-md border-b border-slate-800 px-4 py-3">
        <div className="max-w-md mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={onBack}
              className="p-2 rounded-xl bg-slate-800 border border-slate-700 text-slate-300 hover:text-white transition"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div>
              <h1 className="font-extrabold text-white text-base">Galeri Dokumentasi</h1>
              <p className="text-[11px] text-slate-400 font-medium">Bukti Patroli, Mutasi & Kejadian</p>
            </div>
          </div>
          <span className="text-xs font-mono font-bold text-blue-400">
            {mediaList.length} Foto
          </span>
        </div>
      </header>

      <main className="max-w-md mx-auto px-4 pt-4 space-y-4">
        {/* Module Filter Chips */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
          {[
            { id: 'SEMUA', label: 'Semua Media' },
            { id: 'PATROL', label: 'Patroli QR' },
            { id: 'HANDOVER', label: 'Serah Terima' },
            { id: 'INCIDENT', label: 'Kejadian' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveFilter(tab.id as any)}
              className={`px-3 py-1.5 rounded-xl font-bold text-xs whitespace-nowrap transition ${
                activeFilter === tab.id
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-900/30'
                  : 'bg-slate-900 border border-slate-800 text-slate-400 hover:bg-slate-800'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Gallery Grid */}
        {mediaList.length === 0 ? (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 text-center text-slate-400">
            <ImageIcon className="w-10 h-10 mx-auto text-slate-600 mb-2" />
            <p className="text-sm font-medium">Belum ada dokumentasi media pada kategori ini.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {mediaList.map((item) => (
              <div
                key={item.id}
                onClick={() => setSelectedItem(item)}
                className="group cursor-pointer rounded-2xl overflow-hidden border border-slate-800 bg-slate-900 relative shadow-sm hover:border-slate-700 transition aspect-square flex flex-col"
              >
                <div className="flex-1 relative overflow-hidden bg-black">
                  <img
                    src={item.photoUrl}
                    alt={item.caption}
                    className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                  />
                  {/* Category badge */}
                  <div className="absolute top-2 left-2">
                    <span
                      className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
                        item.sourceModule === 'PATROL'
                          ? 'bg-blue-600/90 text-white'
                          : item.sourceModule === 'HANDOVER'
                          ? 'bg-emerald-600/90 text-white'
                          : 'bg-amber-600/90 text-white'
                      }`}
                    >
                      {item.sourceModule}
                    </span>
                  </div>
                </div>
                <div className="p-2.5 bg-slate-900/95 border-t border-slate-800">
                  <p className="text-xs text-white font-semibold truncate leading-tight">
                    {item.caption}
                  </p>
                  <p className="text-[10px] text-slate-400 font-mono mt-0.5">
                    {new Date(item.eventAt).toLocaleTimeString('id-ID')} WIB
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Lightbox Modal */}
      {selectedItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-md p-4">
          <div className="w-full max-w-md bg-slate-900 border border-slate-700 rounded-2xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between p-4 border-b border-slate-800 bg-slate-950">
              <div>
                <span className="text-xs font-bold text-blue-400 uppercase tracking-wider">
                  {selectedItem.sourceModule} • {selectedItem.category}
                </span>
                <p className="text-xs text-white font-semibold truncate">{selectedItem.caption}</p>
              </div>
              <button
                onClick={() => setSelectedItem(null)}
                className="p-1.5 rounded-lg bg-slate-800 text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 bg-black flex items-center justify-center overflow-hidden p-2">
              <img
                src={selectedItem.photoUrl}
                alt={selectedItem.caption}
                className="max-h-[50vh] max-w-full object-contain rounded-lg"
              />
            </div>

            <div className="p-4 bg-slate-950 border-t border-slate-800 space-y-2 text-xs">
              <div className="flex items-center justify-between text-slate-400 font-mono">
                <span>Waktu: {new Date(selectedItem.eventAt).toLocaleString('id-ID')} WIB</span>
                <span>Shift: {selectedItem.shiftCode}</span>
              </div>
              {selectedItem.latitude && selectedItem.longitude && (
                <div className="flex items-center gap-1.5 text-slate-400 font-mono">
                  <MapPin className="w-3.5 h-3.5 text-blue-400" />
                  <span>
                    GPS: {selectedItem.latitude.toFixed(6)}, {selectedItem.longitude.toFixed(6)}
                  </span>
                </div>
              )}

              <button
                onClick={() => handleDownload(selectedItem)}
                className="w-full mt-2 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold rounded-xl flex items-center justify-center gap-1.5 transition"
              >
                <Download className="w-4 h-4" />
                <span>Unduh Foto Resolusi Penuh</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
