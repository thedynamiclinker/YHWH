// command: quit
export default api => api.run(api.keyContext === 'terminal' ? 'close-terminal' : 'quit');
