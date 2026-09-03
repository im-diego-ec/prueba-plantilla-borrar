# Decisiones estructurales (ADR)

Un **ADR** (*Architecture Decision Record*) es **una decisión que cambia la forma
del sistema, escrita con lo que se descartó**. Lo que lo hace útil no es la decisión: es el descarte. Dentro de seis
meses, alguien va a proponer exactamente lo que ya se descartó, y sin el motivo
escrito no hay forma de saber si el contexto cambió o si es la misma idea otra vez.

**Un archivo por decisión**, con la fecha adelante para que el orden se lea solo:

```
docs/adr/2026-08-31-por-que-cola-y-no-cron.md
```

**Qué contesta**, en este orden y sin secciones de más:

1. **Contexto** — qué había, qué apretaba.
2. **Decisión** — qué se hace, en una frase.
3. **Alternativas descartadas** — cada una con **por qué no**. Ésta es la sección
   que justifica el archivo.
4. **Consecuencias** — qué se vuelve más fácil y qué más difícil.

**No se escriben por adelantado.** Un ADR sobre una decisión que todavía no se
tomó es una suposición con formato de registro.
