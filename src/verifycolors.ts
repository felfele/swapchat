export const hexToColors = (hex: string): string[] => {
    const colors = [];
    let color = '';
    for (let i = 0; i < hex.length; i++) {
        if (color.length == 6) {
            colors.push('#' + color);
            color = '';
        }
        color += hex[i];
    }
    if (color.length > 0 && color.length < 6) {
        while (color.length < 6) {
            color += '0';
        }
        colors.push(color);
    }
    return colors;
};
