# === NFe Manager Pro - Fullstack Dockerfile ===

# 1. Usar a imagem oficial do .NET SDK 8.0 (Baseada em Debian)
FROM mcr.microsoft.com/dotnet/sdk:8.0

# 2. Instalar Node.js (Versão 20.x LTS)
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

# CORREÇÃO IMPORTANTE:
# Se a pasta 'node_modules' local for copiada pelo 'COPY . .', ela sobrescreve a instalação Linux.
# Removemos e reinstalamos para garantir binários compatíveis (esbuild/vite).
RUN rm -rf node_modules && npm install

# 6. Criar diretórios de persistência explicitamente
RUN mkdir -p /app/data /app/certificates

# 7. Expor as portas do sistema
EXPOSE 80
EXPOSE 5000

# 8. Variáveis de Ambiente
ENV ASPNETCORE_URLS=http://+:5000
ENV DOTNET_RUNNING_IN_CONTAINER=true

# 9. Definir Volumes
VOLUME ["/app/data", "/app/certificates"]

# 10. Comando de Inicialização
CMD ["npm", "run", "dev"]