import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Middleware customizado para persistir dados no FileSystem do servidor (Container)
const fileSystemPersistence = () => ({
  name: 'filesystem-persistence',
  configureServer(server) {
    server.middlewares.use((req, res, next) => {
      // Endpoint da API para Banco de Dados
      if (req.url === '/api/db') {
        // Define o caminho: prioriza /app/data (Volume Docker), fallback para ./data (Local)
        const dockerPath = '/app/data';
        const localPath = path.resolve(__dirname, 'data');
        const dataDir = fs.existsSync(dockerPath) ? dockerPath : localPath;
        const dbFile = path.join(dataDir, 'db.json');

        // Garante que o diretório existe
        if (!fs.existsSync(dataDir)) {
          fs.mkdirSync(dataDir, { recursive: true });
        }

        // GET: Ler dados
        if (req.method === 'GET') {
          try {
            if (fs.existsSync(dbFile)) {
              const content = fs.readFileSync(dbFile, 'utf-8');
              res.setHeader('Content-Type', 'application/json');
              res.end(content);
            } else {
              // Retorna estrutura inicial vazia se arquivo não existir
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ companies: [], invoices: [] }));
            }
          } catch (error) {
            console.error('Erro ao ler DB:', error);
            res.statusCode = 500;
            res.end(JSON.stringify({ error: 'Erro ao ler banco de dados' }));
          }
          return;
        }

        // POST: Salvar dados
        if (req.method === 'POST') {
          let body = '';
          req.on('data', chunk => { body += chunk.toString(); });
          req.on('end', () => {
            try {
              // Valida se é um JSON válido antes de salvar
              JSON.parse(body);
              fs.writeFileSync(dbFile, body);
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ success: true }));
            } catch (error) {
              console.error('Erro ao salvar DB:', error);
              res.statusCode = 500;
              res.end(JSON.stringify({ error: 'Erro ao salvar banco de dados' }));
            }
          });
          return;
        }
      }
      next();
    });
  },
});

export default defineConfig({
  plugins: [react(), fileSystemPersistence()],
  server: {
    host: true, // Listen on all addresses (0.0.0.0)
    port: 80,   // Standard web port
    strictPort: true,
    allowedHosts: true, // Allow all hosts
    watch: {
      usePolling: true // Better docker compatibility
    }
  },
  preview: {
    host: true,
    port: 80,
    allowedHosts: true
  }
});