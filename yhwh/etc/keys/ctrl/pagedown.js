// command: next-tab
export default api => api.run(api.keyContext === 'terminal' ? 'next-terminal' : 'next-tab');
