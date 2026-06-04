# Validate App (QA como humano)

Valida uma aplicação web rodando-a num navegador controlado e analisando o resultado como um QA humano faria. Use quando o usuário pedir pra testar/validar um app, página ou fluxo ("valida meu app", "vê se os botões funcionam", "roda um QA nesse site").

Arquitetura em duas camadas: um **crawler determinístico** (`tools/qa-crawl.js`) coleta os fatos, e **você** faz o julgamento visual.

## Setup (uma vez por projeto)
- Requer **Chromium/Chrome** instalado. Aponte com `CHROMIUM_PATH=/usr/bin/chromium` se não estiver no padrão.
- Requer `playwright-core`: `npm install playwright-core` (ou já estar nas deps do projeto).

## Steps
1. **Confirme a URL** do app com o usuário (ex: `https://meu-app.com`).
2. **Rode o crawler:**
   ```bash
   node tools/qa-crawl.js --url <URL> --max 25
   ```
   Opções: `--max N` (quantos botões clicar), `--no-mobile` (pula viewport mobile).
3. **Leia o relatório** gerado em `reports/<host>_<timestamp>/report.md` — resumo de erros de console, requisições falhas (4xx/5xx), links quebrados, botões com problema, overflow no mobile.
4. **Olhe os screenshots** (`desktop-home.png`, `mobile-home.png`) com o tool Read (visão). Procure: seções em branco/não carregadas, layout quebrado, texto cortado/sobreposto, imagens quebradas, overflow no mobile.
5. **Dê o veredito** classificando cada achado.

## Output Format
- 🔴 **Quebrado** (corrigir): erro de JS, botão morto, link 404, requisição 5xx, seção que não carrega
- 🟡 **Suspeito** (conferir): bloco vazio que pode ser vídeo/lazy-load, layout estranho
- 🟢 **Ok:** o que funcionou
Termine com um veredito geral: aprovado pra deploy, ou precisa de correção.

## Rules
- Seja honesto sobre os limites — você pode errar como um humano cansado. Aponte o que merece olho humano, não afirme 100%.
- Bloco preto/vazio num screenshot pode ser: (a) vídeo que não renderiza em headless (normal); (b) animação de scroll (o crawler já rola a página); (c) bug real de carregamento. Diga qual você suspeita.
- Priorize bugs concretos (console, requisição falha, link quebrado) sobre suspeitas visuais.
- Para fluxos críticos (login, pagamento, checkout), recomende também um teste determinístico fixo — este QA complementa, não substitui.
- Registre na memória (MEMORY.md) bugs recorrentes que esse app costuma ter, pra acelerar validações futuras.
