public class InputValidator {
    public static boolean isValidEmail(String email) {
        return email.contains("@") && email.contains(".");
    }
    
    public static boolean isStrongPassword(String password) {
        return password.length() >= 8 && 
               password.matches(".*[A-Z].*") && 
               password.matches(".*[0-9].*");
    }
    
    public static String formatCurrency(double amount) {
        return String.format("$%.2f", amount);
    }
}
