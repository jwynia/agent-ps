# Use Microsoft's typescript-node image which has Node, npm, pnpm, yarn
# already set up with proper shell integration for devcontainers
FROM mcr.microsoft.com/devcontainers/typescript-node:24

# Install system dependencies for native modules
RUN apt-get update && apt-get install -y \
    build-essential \
    unzip \
    && rm -rf /var/lib/apt/lists/*

# ============ Bun ============
ENV BUN_INSTALL="/usr/local/bun"
ENV PATH="$BUN_INSTALL/bin:$PATH"
RUN curl -fsSL https://bun.sh/install | bash \
    && chmod -R a+rx "$BUN_INSTALL"

# ============ Deno ============
ENV DENO_INSTALL="/usr/local/deno"
ENV PATH="$DENO_INSTALL/bin:$PATH"
RUN mkdir -p "$DENO_INSTALL" \
    && curl -fsSL https://deno.land/install.sh | DENO_INSTALL="$DENO_INSTALL" sh \
    && chmod -R a+rx "$DENO_INSTALL"

# ============ Claude Code CLI ============
# Installer always uses ~/.local, so install then move to system location
# node user owns it so self-update works at runtime
ENV CLAUDE_HOME="/usr/local/claude"
ENV PATH="$CLAUDE_HOME/bin:$PATH"
RUN curl -fsSL https://claude.ai/install.sh | bash \
    && mkdir -p "$CLAUDE_HOME/bin" "$CLAUDE_HOME/share" \
    && mv /root/.local/share/claude/* "$CLAUDE_HOME/share/" \
    && CLAUDE_VERSION=$(ls "$CLAUDE_HOME/share/versions/" | head -1) \
    && ln -s "$CLAUDE_HOME/share/versions/$CLAUDE_VERSION" "$CLAUDE_HOME/bin/claude" \
    && rm -rf /root/.local/bin/claude /root/.local/share/claude \
    && chown -R node:node "$CLAUDE_HOME"

# ============ Fix sudo PATH for additional tools ============
RUN echo 'Defaults secure_path="/usr/local/claude/bin:/usr/local/bun/bin:/usr/local/deno/bin:/usr/local/share/nvm/current/bin:/usr/local/share/npm-global/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"' > /etc/sudoers.d/dev-tools-path \
    && chmod 0440 /etc/sudoers.d/dev-tools-path

# ============ Capture final PATH for login shells ============
# Base image uses 00-restore-env.sh to restore build-time PATH at login.
# We overwrite it to include our additions (bun, deno, claude).
RUN echo "export PATH=${PATH}" > /etc/profile.d/00-restore-env.sh \
    && chmod +x /etc/profile.d/00-restore-env.sh
