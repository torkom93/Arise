import {defineConfig} from 'vite';
export default defineConfig({base:'./',server:{host:'127.0.0.1',allowedHosts:['terminal.local']},preview:{host:'127.0.0.1'}});
