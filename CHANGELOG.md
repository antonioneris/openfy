# Changelog

Todas as mudanças relevantes do OpenFy serão documentadas neste arquivo.

## [1.1.0] - 2026-07-18

### Adicionado

- Binários privados e multiplataforma de yt-dlp, FFmpeg e FFprobe, baixados na primeira execução.
- Estados explícitos, progresso e cancelamento durante a indexação da biblioteca.
- Recuperação orientada quando uma pasta perde autorização.
- Métricas locais de desempenho e testes de acessibilidade e resiliência.
- Workflow de CI e releases automáticas para macOS, Windows e Linux.

### Alterado

- A biblioteca agora abre diretamente pelo cache SQLite e valida mudanças em segundo plano.
- Arquivos sem alterações não têm seus metadados processados novamente.
- O seletor de transmissão usa o ícone Cast padrão e um modal acessível.
- Busca, configurações, navegação e mensagens de estado receberam melhorias de usabilidade.

### Corrigido

- Compatibilidade entre esquemas antigos e atuais da tabela de pastas do SQLite.
- Exceção do `castv2-client` ao receber respostas Chromecast sem `status[0]`.
- Descoberta e abertura do seletor de dispositivos Chromecast.
- Validação de caminhos autorizados nas operações IPC.
