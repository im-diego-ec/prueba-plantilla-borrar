# CLAUDE.md

Las reglas de este repo viven en **AGENTS.md** — constitucion unica para humanos y
agentes (Claude Code, Cursor).

No hay ninguna regla que viva solo en este archivo. La linea de abajo IMPORTA AGENTS.md
al contexto en el arranque de la sesion: es carga mecanica de Claude Code, no un puntero
que el agente deba recordar seguir.

La cadena tiene DOS eslabones y los dos son mecanicos. AGENTS.md trae lo propio del
proyecto e importa a su vez .projects/AGENTS-marco.md, que es la porcion del marco: las
reglas comunes del area (OpenSpec, git y despliegue, las fronteras de tres niveles,
seguridad, AWS, secretos, GitHub), generadas por el marco y verificadas en el CI. Si ese
segundo eslabon se rompe, el agente trabaja sin la mitad de las reglas y nada en la
sesion lo delata: por eso el CI comprueba que la referencia siga en pie.

@AGENTS.md
