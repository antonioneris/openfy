import React, { useRef, useState, useEffect } from 'react';
import { useMediaLibrary } from '../../../context/MediaLibraryContext';
import { 
  ArrowLeft, Folder, Trash2, FolderPlus, FolderUp, 
  Music, Disc, User, HardDrive, Download, Tv, Wifi,
  Info, Mail, Linkedin, Github, ExternalLink, Keyboard, Activity
} from 'lucide-react';
import styles from '../styles/SettingsView.module.css';
import { getPerformanceMetrics } from '../../../services/performanceMetrics';

export const SettingsView: React.FC = () => {
  const { 
    tracks, 
    folders, 
    playlists,
    setView, 
    scanLocalFolder, 
    importLocalFiles, 
    deleteFolder,
    showConfirm,
    libraryStatus,
    reauthorizeLibraryFolder,
    cancelLibraryScan
  } = useMediaLibrary();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [localIp, setLocalIp] = useState('localhost');
  const [spotifyClientId, setSpotifyClientId] = useState('');
  const [spotifyClientSecret, setSpotifyClientSecret] = useState('');
  const [performanceMetrics, setPerformanceMetrics] = useState(getPerformanceMetrics);

  useEffect(() => {
    if (window.electronAPI?.getLocalIp) {
      window.electronAPI.getLocalIp().then(setLocalIp);
    }
    setSpotifyClientId(localStorage.getItem('spotify_client_id') || '');
    setSpotifyClientSecret(localStorage.getItem('spotify_client_secret') || '');
  }, []);

  useEffect(() => {
    const refreshMetrics = () => setPerformanceMetrics(getPerformanceMetrics());
    window.addEventListener('openfy-performance-metric', refreshMetrics);
    return () => window.removeEventListener('openfy-performance-metric', refreshMetrics);
  }, []);

  const handleSpotifyClientIdChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.trim();
    setSpotifyClientId(val);
    localStorage.setItem('spotify_client_id', val);
  };

  const handleSpotifyClientSecretChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.trim();
    setSpotifyClientSecret(val);
    localStorage.setItem('spotify_client_secret', val);
  };

  // Compute stats
  const uniqueAlbums = new Set(tracks.map(t => t.album.toLowerCase())).size;
  const uniqueArtists = new Set(tracks.map(t => t.artist.toLowerCase())).size;

  const handleRemoveFolder = async (folderName: string) => {
    const confirmed = await showConfirm(
      'Remover Pasta',
      `Tem certeza que deseja remover a pasta "${folderName}" da sua biblioteca? Todas as músicas dessa pasta serão removidas.`
    );
    if (confirmed) {
      await deleteFolder(folderName);
    }
  };

  const handleImportFiles = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const shouldPersist = await showConfirm(
        'Salvar Músicas Offline',
        'Deseja salvar estes arquivos de áudio (.mp3, .m4a) no armazenamento do navegador?\n\nSe sim, eles carregarão automaticamente na próxima vez.'
      );
      importLocalFiles(e.target.files, shouldPersist);
    }
  };

  const openDeveloperLink = (url: string) => {
    if (window.electronAPI?.openExternal) {
      void window.electronAPI.openExternal(url);
      return;
    }
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className={styles.settingsContainer}>
      {/* Header */}
      <div className={styles.settingsHeader}>
        <button className={styles.settingsBackBtn} onClick={() => setView('home')} aria-label="Voltar para o início" title="Voltar">
          <ArrowLeft size={24} />
        </button>
        <h1 className={styles.settingsTitle}>Configurações</h1>
      </div>

      {/* Folders Section */}
      <div className={styles.settingsSection}>
        <h2 className={styles.settingsSectionTitle}>
          <HardDrive size={20} />
          <span>Pastas da Biblioteca</span>
        </h2>
        {libraryStatus.phase === 'permission-required' && (
          <button className={styles.settingsActionBtn} onClick={() => void reauthorizeLibraryFolder()}>
            <FolderPlus size={18} />
            <span>Reautorizar {libraryStatus.folder}</span>
          </button>
        )}
        {(libraryStatus.phase === 'refreshing' || libraryStatus.phase === 'scanning') && (
          <div role="status" aria-live="polite" className={styles.settingsScanStatus}>
            <div>
              <strong>Atualizando biblioteca</strong>
              <span>
                {libraryStatus.total
                  ? `${libraryStatus.processed || 0} de ${libraryStatus.total} arquivos processados`
                  : 'Localizando arquivos de áudio…'}
              </span>
            </div>
            <button type="button" onClick={cancelLibraryScan}>Cancelar</button>
          </div>
        )}
        <p className={styles.settingsSectionDesc}>
          Gerencie as pastas de onde suas músicas são carregadas. Adicione novas pastas ou remova as existentes.
        </p>

        {folders.length === 0 ? (
          <div className={styles.settingsEmptyFolders}>
            <FolderPlus size={40} className={styles.settingsEmptyIcon} />
            <p>Nenhuma pasta adicionada ainda</p>
            <p className={styles.settingsEmptyHint}>Adicione uma pasta para começar a ouvir suas músicas</p>
          </div>
        ) : (
          <div className={styles.settingsFolderList}>
            {folders.map((folder) => {
              const folderTracks = tracks.filter(t => t.filePath.startsWith(folder + '/'));
              return (
                <div key={folder} className={styles.settingsFolderItem}>
                  <div className={styles.settingsFolderInfo}>
                    <div className={styles.settingsFolderIcon}>
                      <Folder size={20} />
                    </div>
                    <div className={styles.settingsFolderDetails}>
                      <div className={styles.settingsFolderName}>{folder}</div>
                      <div className={styles.settingsFolderMeta}>
                        {folderTracks.length} {folderTracks.length === 1 ? 'música' : 'músicas'}
                      </div>
                    </div>
                  </div>
                  <button 
                    className={styles.settingsFolderDelete}
                    onClick={() => handleRemoveFolder(folder)}
                    aria-label={`Remover pasta ${folder}`}
                    title="Remover pasta"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {/* Add folder actions */}
        <div className={styles.settingsFolderActions}>
          {(window as any).showDirectoryPicker ? (
            <button className={styles.settingsActionBtn} onClick={() => void scanLocalFolder()} disabled={libraryStatus.phase === 'selecting'}>
              <FolderPlus size={18} />
              <span>{libraryStatus.phase === 'selecting' ? 'Selecionando pasta...' : 'Adicionar Pasta (PC)'}</span>
            </button>
          ) : null}
          <button className={`${styles.settingsActionBtn} ${styles.secondary}`} onClick={handleImportFiles}>
            <FolderUp size={18} />
            <span>Importar Pasta (Celular)</span>
          </button>
        </div>

        <input
          type="file"
          ref={fileInputRef}
          style={{ display: 'none' }}
          onChange={handleFileChange}
          multiple
          // @ts-ignore
          webkitdirectory="true"
          directory="true"
        />
      </div>

      {/* YouTube Music Downloads Section */}
      {window.electronAPI?.isElectron && (
        <div className={styles.settingsSection}>
          <h2 className={styles.settingsSectionTitle}>
            <Download size={20} />
            <span>Downloads do YouTube Music</span>
          </h2>
          <p className={styles.settingsSectionDesc}>
            As músicas baixadas do YouTube Music serão salvas automaticamente na sua pasta de biblioteca principal:
          </p>
          <div style={{ display: 'flex', gap: '12px', marginTop: '12px' }}>
            <input 
              type="text"
              readOnly
              placeholder="Nenhuma pasta de biblioteca configurada."
              value={folders[0] || 'Nenhuma pasta de biblioteca configurada.'}
              style={{
                flexGrow: 1,
                background: '#181818',
                border: '1px solid #3e3e3e',
                borderRadius: '4px',
                padding: '10px 14px',
                color: folders[0] ? '#ffffff' : 'var(--text-subdued)',
                fontSize: '14px',
                outline: 'none',
                cursor: 'default'
              }}
            />
          </div>
          <p className={styles.settingsSectionDesc} style={{ marginTop: '8px', fontSize: '12.5px', color: 'var(--text-subdued)', lineHeight: '1.4' }}>
            💡 Dica: Adicione uma pasta de biblioteca na seção &quot;Pastas da Biblioteca&quot; acima. Os downloads serão organizados por Artista/Álbum dentro dela, e aparecerão automaticamente na sua biblioteca.
          </p>
        </div>
      )}

      {/* Spotify Import Section */}
      {window.electronAPI?.isElectron && (
        <div className={styles.settingsSection}>
          <h2 className={styles.settingsSectionTitle}>
            <Music size={20} />
            <span>Credenciais de Importação do Spotify</span>
          </h2>
          <p className={styles.settingsSectionDesc}>
            Para importar playlists com mais de 100 músicas do Spotify, configure suas próprias chaves de API (são gratuitas!). Sem elas, apenas as primeiras 100 músicas serão importadas.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '12px', fontWeight: 'bold', color: 'var(--text-subdued)' }}>Client ID do Spotify</label>
              <input 
                type="text"
                placeholder="Insira seu Spotify Client ID"
                value={spotifyClientId}
                onChange={handleSpotifyClientIdChange}
                style={{
                  background: '#181818',
                  border: '1px solid #3e3e3e',
                  borderRadius: '4px',
                  padding: '10px 14px',
                  color: '#ffffff',
                  fontSize: '14px',
                  outline: 'none'
                }}
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '12px', fontWeight: 'bold', color: 'var(--text-subdued)' }}>Client Secret do Spotify</label>
              <input 
                type="password"
                placeholder="Insira seu Spotify Client Secret"
                value={spotifyClientSecret}
                onChange={handleSpotifyClientSecretChange}
                style={{
                  background: '#181818',
                  border: '1px solid #3e3e3e',
                  borderRadius: '4px',
                  padding: '10px 14px',
                  color: '#ffffff',
                  fontSize: '14px',
                  outline: 'none'
                }}
              />
            </div>
          </div>
          <p className={styles.settingsSectionDesc} style={{ marginTop: '12px', fontSize: '12.5px', color: 'var(--text-subdued)', lineHeight: '1.4', marginBottom: '0' }}>
            💡 <strong>Como obter suas chaves:</strong> Acesse o <a href="#" onClick={(e) => { e.preventDefault(); window.electronAPI?.openExternal('https://developer.spotify.com/dashboard'); }} style={{ color: 'var(--spotify-green)', textDecoration: 'underline' }}>Spotify Developer Dashboard</a>, crie ou use um aplicativo existente (pode configurar <strong>qualquer Redirect URI</strong>, ex: <code>http://localhost:3000</code>), e cole o Client ID e Client Secret aqui. <em style={{ fontSize: '11.5px', opacity: 0.8 }}>(Nota: O app usa o fluxo Client Credentials, portanto a Redirect URI do painel não é enviada ou validada e pode ser qualquer endereço).</em>
          </p>
        </div>
      )}

      {/* Transmitir Section */}
      {window.electronAPI?.isElectron && (
        <div className={styles.settingsSection}>
          <h2 className={styles.settingsSectionTitle}>
            <Tv size={20} />
            <span>Transmitir para TV / Dispositivo</span>
          </h2>
          <p className={styles.settingsSectionDesc}>
            Transmita as letras de música e a tela cheia do player em tempo real para qualquer Smart TV, Chromecast, Apple TV ou celular na mesma rede Wi-Fi.
          </p>

          <div style={{
            background: 'rgba(29, 185, 84, 0.1)',
            border: '1px solid rgba(29, 185, 84, 0.3)',
            borderRadius: '6px',
            padding: '16px',
            marginTop: '16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--spotify-green)', fontWeight: 'bold' }}>
              <Wifi size={18} />
              <span>Link de Transmissão Ativo</span>
            </div>
            <div style={{
              background: '#121212',
              padding: '10px 14px',
              borderRadius: '4px',
              fontFamily: 'monospace',
              fontSize: '15px',
              color: '#ffffff',
              border: '1px solid #282828',
              userSelect: 'all',
              wordBreak: 'break-all',
              textAlign: 'center'
            }}>
              http://{localIp}:8083/cast
            </div>
            <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-subdued)', lineHeight: '1.4' }}>
              💡 Acesse este endereço de qualquer navegador web (em uma Smart TV, console de videogame, celular ou tablet) conectado à mesma rede Wi-Fi para iniciar o espelhamento em tempo real.
            </p>
          </div>

          <div style={{ marginTop: '16px', fontSize: '13px', color: 'var(--text-subdued)', lineHeight: '1.6' }}>
            <strong style={{ color: '#ffffff', display: 'block', marginBottom: '6px' }}>Instruções de Conexão:</strong>
            <ul style={{ paddingLeft: '20px', margin: 0, display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <li><strong>Google Cast / Chromecast:</strong> Abra o link no Google Chrome de um computador ou celular, clique no menu de opções (três pontos) do Chrome e selecione <strong>Transmitir...</strong> para o seu dispositivo.</li>
              <li><strong>Apple AirPlay / Apple TV:</strong> Abra o link no navegador Safari do seu iPhone, iPad ou Mac, clique no ícone de compartilhamento/AirPlay e selecione a sua TV ou Apple TV.</li>
              <li><strong>Smart TVs (LG webOS, Samsung Tizen, Fire TV, Roku, Xbox):</strong> Abra o aplicativo de Navegador de Internet nativo da sua TV, digite o link acima e coloque em tela cheia. O player sincroniza na hora!</li>
            </ul>
          </div>
        </div>
      )}

      {/* Library Statistics */}
      <div className={styles.settingsSection}>
        <h2 className={styles.settingsSectionTitle}>
          <Activity size={20} />
          <span>Desempenho desta instalação</span>
        </h2>
        <p className={styles.settingsSectionDesc}>Medições locais usadas para diagnosticar carregamento, indexação e início do áudio.</p>
        <div className={styles.metricsGrid}>
          {[
            ['time-to-first-content', 'Primeiro conteúdo'],
            ['library-indexation', 'Última indexação'],
            ['time-to-first-audio', 'Primeiro áudio'],
          ].map(([name, label]) => {
            const metric = [...performanceMetrics].reverse().find(item => item.name === name);
            return (
              <div key={name}>
                <span>{label}</span>
                <strong>{metric ? `${metric.durationMs} ms` : 'Ainda não medido'}</strong>
              </div>
            );
          })}
        </div>
      </div>

      {/* Library Statistics */}
      <div className={styles.settingsSection}>
        <h2 className={styles.settingsSectionTitle}>
          <Keyboard size={20} />
          <span>Atalhos do teclado</span>
        </h2>
        <p className={styles.settingsSectionDesc}>Funcionam quando o foco não está em um campo de texto ou botão.</p>
        <dl className={styles.shortcutsGrid}>
          <div><dt><kbd>Espaço</kbd></dt><dd>Tocar ou pausar</dd></div>
          <div><dt><kbd>←</kbd> <kbd>→</kbd></dt><dd>Voltar ou avançar 5 segundos</dd></div>
          <div><dt><kbd>↑</kbd> <kbd>↓</kbd></dt><dd>Aumentar ou diminuir o volume</dd></div>
          <div><dt><kbd>M</kbd></dt><dd>Ativar ou silenciar o som</dd></div>
          <div><dt><kbd>Q</kbd></dt><dd>Abrir ou fechar a fila</dd></div>
          <div><dt><kbd>L</kbd></dt><dd>Abrir ou fechar as letras</dd></div>
        </dl>
      </div>

      {/* Library Statistics */}
      <div className={styles.settingsSection}>
        <h2 className={styles.settingsSectionTitle}>
          <Music size={20} />
          <span>Estatísticas da Biblioteca</span>
        </h2>
        <div className={styles.settingsStatsGrid}>
          <div className={styles.settingsStatCard}>
            <div className={styles.settingsStatIcon}>
              <Music size={24} />
            </div>
            <div className={styles.settingsStatValue}>{tracks.length}</div>
            <div className={styles.settingsStatLabel}>Músicas</div>
          </div>
          <div className={styles.settingsStatCard}>
            <div className={styles.settingsStatIcon}>
              <Disc size={24} />
            </div>
            <div className={styles.settingsStatValue}>{uniqueAlbums}</div>
            <div className={styles.settingsStatLabel}>Álbuns</div>
          </div>
          <div className={styles.settingsStatCard}>
            <div className={styles.settingsStatIcon}>
              <User size={24} />
            </div>
            <div className={styles.settingsStatValue}>{uniqueArtists}</div>
            <div className={styles.settingsStatLabel}>Artistas</div>
          </div>
          <div className={styles.settingsStatCard}>
            <div className={styles.settingsStatIcon}>
              <Folder size={24} />
            </div>
            <div className={styles.settingsStatValue}>{folders.length}</div>
            <div className={styles.settingsStatLabel}>Pastas</div>
          </div>
          <div className={styles.settingsStatCard}>
            <div className={styles.settingsStatIcon}>
              <Music size={24} />
            </div>
            <div className={styles.settingsStatValue}>{playlists.length}</div>
            <div className={styles.settingsStatLabel}>Playlists</div>
          </div>
        </div>
      </div>

      {/* About */}
      <div className={`${styles.settingsSection} ${styles.aboutSection}`}>
        <h2 className={styles.settingsSectionTitle}>
          <Info size={20} />
          <span>Sobre</span>
        </h2>
        <div className={styles.aboutHeader}>
          <div className={styles.aboutLogo} aria-hidden="true">O</div>
          <div>
            <h3 className={styles.aboutAppName}>OpenFy</h3>
            <p className={styles.aboutTagline}>Seu player de música local.</p>
          </div>
        </div>
        <div className={styles.developerCard}>
          <span className={styles.developerLabel}>Desenvolvido por</span>
          <strong className={styles.developerName}>Antonio Neris</strong>
          <div className={styles.developerLinks}>
            <div className={styles.developerContact}>
              <Mail size={17} />
              <span>antonioneris@gmail.com</span>
            </div>
            <button type="button" onClick={() => openDeveloperLink('https://www.linkedin.com/in/antonio-neris/')}>
              <Linkedin size={17} />
              <span>LinkedIn</span>
              <ExternalLink size={14} />
            </button>
            <button type="button" onClick={() => openDeveloperLink('https://github.com/antonioneris')}>
              <Github size={17} />
              <span>GitHub</span>
              <ExternalLink size={14} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
