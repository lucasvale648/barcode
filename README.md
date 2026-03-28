# Scanner de Produtos — PWA

Scanner de código de barras para produtos de limpeza.  
Consulta automaticamente nas bases **Open Products Facts** e **Open Food Facts** (gratuito, sem limite).

---

## Estrutura de arquivos

```
barcode-pwa/
├── index.html      ← HTML principal
├── app.css         ← Estilos
├── app.js          ← Lógica da aplicação
├── manifest.json   ← Configuração PWA
├── sw.js           ← Service Worker (cache / offline)
└── icons/
    ├── icon-192.png
    └── icon-512.png
```

---

## Como rodar localmente

### Opção 1 — Python (mais simples)
```bash
cd barcode-pwa
python3 -m http.server 8080
```
Acesse: `http://localhost:8080`

### Opção 2 — Node + serve
```bash
npx serve barcode-pwa
```

### Opção 3 — VS Code
Instale a extensão **Live Server** e clique em "Go Live".

> ⚠️ A câmera exige **HTTPS** em produção (localhost funciona sem HTTPS).

---

## Como hospedar (produção)

### Netlify (mais fácil — arraste a pasta)
1. Acesse [netlify.com](https://netlify.com)
2. Arraste a pasta `barcode-pwa` para o painel
3. Pronto — URL HTTPS automática

### Vercel
```bash
npm i -g vercel
cd barcode-pwa
vercel
```

### GitHub Pages
1. Suba a pasta para um repositório GitHub
2. Ative GitHub Pages nas configurações do repositório

---

## Funcionalidades

- **Scanner via câmera** — usa ZXing para leitura em tempo real
- **Busca manual** — pode digitar o código de barras
- **Dupla API** — tenta Open Products Facts, depois Open Food Facts
- **Histórico** — salvo localmente (localStorage), últimos 50 scans
- **Instalável** — banner de instalação automático (Android/Chrome)
- **Offline parcial** — assets cacheados pelo Service Worker

---

## Personalização

Todas as cores estão em variáveis CSS no início do `app.css`:

```css
:root {
  --bg: #f5f5f5;
  --surface: #ffffff;
  --accent: #1a1a1a;   ← Cor principal (botões, destaques)
  --text: #1a1a1a;
  ...
}
```

Para dark mode completo, adicione uma media query:
```css
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #0f0f0f;
    --surface: #1a1a1a;
    --accent: #ffffff;
    ...
  }
}
```

---

## APIs utilizadas

| API | URL | Cobertura |
|-----|-----|-----------|
| Open Products Facts | `world.openproductsfacts.org` | Produtos gerais |
| Open Food Facts | `world.openfoodfacts.org` | Alimentos/bebidas |

Ambas são gratuitas, abertas e sem necessidade de cadastro ou token.
