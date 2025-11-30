/**
 * Calculates the checksum for the first 12 digits of an EAN-13 code.
 * @param twelveDigits A string containing the first 12 digits.
 * @returns The single checksum digit as a string.
 */
const calculateEan13Checksum = (twelveDigits: string): string => {
    if (twelveDigits.length !== 12) {
        throw new Error("Input must be 12 digits long.");
    }

    let sumOdd = 0;
    let sumEven = 0;

    for (let i = 0; i < 12; i++) {
        const digit = parseInt(twelveDigits[i], 10);
        if (i % 2 === 0) { // Odd positions (1st, 3rd, etc. -> index 0, 2, ...)
            sumOdd += digit;
        } else { // Even positions (2nd, 4th, etc. -> index 1, 3, ...)
            sumEven += digit;
        }
    }

    const totalSum = sumOdd + (sumEven * 3);
    const checksum = (10 - (totalSum % 10)) % 10;

    return checksum.toString();
};

/**
 * Generates a random, valid EAN-13 barcode number.
 * The generated codes are for placeholder/internal use and are not registered with GS1.
 * It uses the Polish GS1 prefix to comply with Allegro's validation rules.
 * @returns A 13-digit EAN code as a string.
 */
export const generateEan13 = (): string => {
    // Używamy polskiego prefiksu GS1 (590), aby generować numery EAN, które są zgodne z wymaganiami Allegro
    // i unikają zastrzeżonych zakresów dla użytku wewnętrznego (200-299), które są odrzucane.
    const prefix = "590"; 
    let randomPart = '';
    for (let i = 0; i < 9; i++) {
        randomPart += Math.floor(Math.random() * 10).toString();
    }

    const twelveDigits = prefix + randomPart;
    const checksum = calculateEan13Checksum(twelveDigits);
    
    return twelveDigits + checksum;
};