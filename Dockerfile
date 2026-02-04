# === NFe Manager Pro - Fullstack Dockerfile ===

# 1. Usar a imagem oficial do .NET SDK 8.0 (Baseada em Debian)
# Isso garante que o comando 'dotnet run' funcione para o backend
FROM mcr.microsoft.com/dotnet/sdk:8.0

# 2. Instalar Node.js (Versão 20.x LTS)
# Necessário para rodar o Vite/Frontend
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && \
    apt-get install -y nodejs && \
    npm install -g npm@latest

# Definir diretório de trabalho
WORKDIR /app

# 3. Otimização de Cache: Copiar e instalar dependências do Node primeiro
COPY package.json package-lock.json* ./
RUN npm install

# 4. Otimização de Cache: Copiar e restaurar dependências do .NET
COPY backend/NFeBackend.csproj ./backend/
RUN cd backend && dotnet restore

# 5. Copiar o restante do código fonte
COPY . .

# 6. Criar diretórios de persistência explicitamente
# Isso evita erros de permissão ao tentar salvar arquivos pela primeira vez
RUN mkdir -p /app/data /app/certificates

# 7. Expor as portas do sistema
# Porta 80: Frontend (Vite)
# Porta 5000: Backend (.NET API)
EXPOSE 80
EXPOSE 5000

# 8. Variáveis de Ambiente para garantir Bind correto
# Garante que o .NET escute em 0.0.0.0 (acessível fora do container)
ENV ASPNETCORE_URLS=http://+:5000
ENV DOTNET_RUNNING_IN_CONTAINER=true

# 9. Definir Volumes para persistência de dados
# Ao rodar o container, mapeie pastas locais para estes caminhos
VOLUME ["/app/data", "/app/certificates"]

# 10. Comando de Inicialização
# Roda o script 'dev' que inicia Backend e Frontend simultaneamente via 'concurrently'
CMD ["npm", "run", "dev"]