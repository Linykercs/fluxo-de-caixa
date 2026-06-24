# Skills para o projeto Fluxo de Caixa

## Como instalar
1. Extraia este zip na RAIZ da pasta do seu projeto (a pasta oculta `.claude/` será criada com as skills dentro)
2. Abra o Claude Code nessa pasta
3. Confirme que as skills foram carregadas (digite /skills ou pergunte "quais skills você tem?")
4. Cole o conteúdo do arquivo PROMPT-fluxo-de-caixa.md (a parte entre "PROMPT" e "Fim do prompt")

## O que tem aqui
- .claude/skills/brainstorming/      -> refina a ideia e gera o spec (roda primeiro)
- .claude/skills/writing-plans/      -> transforma o spec aprovado em plano de implementacao
- .claude/skills/backend-design/     -> regras do servidor: dinheiro em centavos, saldo derivado, transacoes
- .claude/skills/frontend-design/    -> direcao visual da interface
- PROMPT-fluxo-de-caixa.md           -> o prompt completo para iniciar o projeto

## Fluxo esperado
ideia -> perguntas (uma por vez) -> spec aprovado -> plano aprovado -> backend com testes -> frontend

Dica: se quiser usar essas skills em TODOS os seus projetos, copie as pastas
de .claude/skills/ para ~/.claude/skills/ (pasta do usuario).
