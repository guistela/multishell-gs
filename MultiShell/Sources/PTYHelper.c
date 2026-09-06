#include "PTYHelper.h"
#include <unistd.h>
#include <stdlib.h>
#include <stdio.h>
#include <sys/ioctl.h>
#include <termios.h>
#include <string.h>
#include <libproc.h>

static void apply_environment_vars(const char *environment_vars) {
    if (environment_vars == NULL || strlen(environment_vars) == 0) {
        return;
    }

    char *vars = strdup(environment_vars);
    if (vars == NULL) {
        return;
    }

    char *saveptr = NULL;
    char *line = strtok_r(vars, "\n", &saveptr);
    while (line != NULL) {
        char *separator = strchr(line, '=');
        if (separator != NULL && separator != line) {
            *separator = '\0';
            setenv(line, separator + 1, 1);
        }
        line = strtok_r(NULL, "\n", &saveptr);
    }

    free(vars);
}

pid_t pty_spawn_shell(int master_fd, int slave_fd, const char *shell_path, const char *working_dir, const char *environment_vars) {
    pid_t pid = fork();

    if (pid < 0) {
        // Erro no fork
        return -1;
    }

    if (pid == 0) {
        // Processo filho

        // Mudar diretório se fornecido
        if (working_dir != NULL && strlen(working_dir) > 0) {
            chdir(working_dir);
        }

        // Fechar master (apenas o pai precisa)
        close(master_fd);

        // Criar nova sessão
        if (setsid() < 0) {
            _exit(1);
        }

        // Configurar slave como controlling terminal
        if (ioctl(slave_fd, TIOCSCTTY, NULL) < 0) {
            _exit(1);
        }

        // Duplicar slave para stdin/stdout/stderr
        if (dup2(slave_fd, STDIN_FILENO) < 0 ||
            dup2(slave_fd, STDOUT_FILENO) < 0 ||
            dup2(slave_fd, STDERR_FILENO) < 0) {
            _exit(1);
        }

        // Fechar slave original (já duplicado)
        if (slave_fd > STDERR_FILENO) {
            close(slave_fd);
        }

        // Configurar ambiente
        setenv("TERM", "xterm-256color", 1);
        setenv("COLORTERM", "truecolor", 1);
        apply_environment_vars(environment_vars);

        // Executar shell como login shell (prefixando argv[0] com '-')
        char *shell_name = strrchr(shell_path, '/');
        if (shell_name) {
            shell_name++; // pular a '/'
        } else {
            shell_name = (char *)shell_path;
        }
        
        char login_shell_name[64];
        snprintf(login_shell_name, sizeof(login_shell_name), "-%s", shell_name);

        execl(shell_path, login_shell_name, NULL);

        // Se chegou aqui, houve erro
        _exit(1);
    }

    // Processo pai - retornar PID do filho
    return pid;
}

void pty_resize(int master_fd, int cols, int rows) {
    struct winsize ws;
    ws.ws_col = (unsigned short)cols;
    ws.ws_row = (unsigned short)rows;
    ws.ws_xpixel = 0;
    ws.ws_ypixel = 0;
    ioctl(master_fd, TIOCSWINSZ, &ws);
}

int pty_get_cwd(pid_t pid, char *buffer, int max_len) {
    struct proc_vnodepathinfo path_info;
    int size = sizeof(struct proc_vnodepathinfo);
    int result = proc_pidinfo(pid, PROC_PIDVNODEPATHINFO, 0, &path_info, size);
    if (result == size) {
        strncpy(buffer, path_info.pvi_cdir.vip_path, max_len);
        buffer[max_len - 1] = '\0';
        return 0; // sucesso
    }
    return -1; // erro
}
