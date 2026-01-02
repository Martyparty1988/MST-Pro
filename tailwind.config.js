/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            animation: {
                'swing': 'swing 2s ease-in-out infinite',
            },
            keyframes: {
                swing: {
                    '0%, 100%': { transform: 'rotate(-10deg)' },
                    '50%': { transform: 'rotate(10deg)' },
                }
            }
        },
    },
    plugins: [],
}
