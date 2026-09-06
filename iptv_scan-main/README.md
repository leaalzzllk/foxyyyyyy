# IPTV SCAN
## Requesitos:

## Formato de combo valido

## Uso

ex: python scan.py -H http://seu_host.com -C combo.txt -O listas.txt -B 7

### Notebooks


# ListaForge

Gerenciador de playlists M3U para conteúdo autorizado, com assinaturas e expiração de acesso.

## Requisitos

- Node.js 18 ou superior
- O arquivo `lista` na pasta-pai do projeto

## Executar localmente

No PowerShell:

```powershell
cd "C:\Users\FELIPE\Downloads\iptv_scan-main\iptv_scan-main"
$env:ADMIN_KEY="troque-esta-chave"
$env:PUBLIC_URL="http://localhost:3000"
node server.js
```

Abra `http://localhost:3000/admin` para criar assinaturas.

## Entregar ao cliente

O painel gera um link M3U e os dados Xtream Codes. O cliente só conseguirá acessar enquanto o servidor estiver online e publicado em um endereço acessível pela internet.

Para hospedagem, configure:

```text
ADMIN_KEY=uma-chave-forte
PUBLIC_URL=https://seu-dominio.com
PORT=3000
```

Use HTTPS em produção e distribua apenas streams que você tem autorização para redistribuir.

## Endpoints

- `GET /admin` painel administrativo
- `GET /health` status do servidor e quantidade de canais
- `GET /playlist.m3u?token=...` playlist por token
- `GET /get.php?username=...&password=...` playlist Xtream/M3U
- `GET /player_api.php?username=...&password=...` API Xtream


