// command: previous-tab
export default api => api.run(api.keyContext === 'terminal' ? 'previous-terminal' : 'previous-tab');
