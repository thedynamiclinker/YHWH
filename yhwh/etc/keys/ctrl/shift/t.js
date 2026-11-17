// command: reopen-tab
export default api => api.run(api.keyContext === 'terminal' ? 'new-terminal' : 'reopen-tab');
