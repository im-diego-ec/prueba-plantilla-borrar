# Post-mortems

Qué pasó en un incidente, **dentro de las 48 horas y sin culpas**. Las dos cosas
son la regla, y las dos tienen motivo: a las 48 h todavía se recuerdan los
detalles que importan, y un post-mortem que busca culpables deja de recibir
información —la gente deja de contar lo que hizo—.

**Un archivo por incidente**, con la fecha del incidente:

```
docs/postmortems/2026-08-31-el-despliegue-quedo-a-medias.md
```

**Qué contesta**:

1. **Qué vio la gente** — el síntoma, no la causa.
2. **Línea de tiempo** — con horas, de la primera señal a la recuperación.
3. **Causa** — qué lo permitió, no quién lo hizo.
4. **Qué lo habría detectado antes** — y si no existe, eso es el trabajo que sale
   de acá.
5. **Acciones** — cada una con dueño y fecha, o no es una acción.

La pregunta que ordena todo: **¿qué control faltaba?** Un post-mortem que termina
en «hay que tener más cuidado» no dejó nada.
