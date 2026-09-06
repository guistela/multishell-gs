#ifndef PTYHelper_h
#define PTYHelper_h

#include <sys/types.h>

// Inicia um shell em PTY usando fork/exec
// Retorna o PID do processo filho, ou -1 em caso de erro
pid_t pty_spawn_shell(int master_fd, int slave_fd, const char *shell_path, const char *working_dir, const char *environment_vars);

// Redimensiona o terminal PTY
void pty_resize(int master_fd, int cols, int rows);

// Obtém o diretório de trabalho atual do PID
int pty_get_cwd(pid_t pid, char *buffer, int max_len);

#endif /* PTYHelper_h */
