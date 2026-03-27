public class Main {
    public static void main(String[] args) {
        // Generate a lot of output to test PDF pagination
        System.out.println("=== LARGE OUTPUT TEST ===");
        for (int i = 1; i <= 50; i++) {
            System.out.println("Line " + i + ": This is a test line with some content to generate larger output for PDF rendering test. Each line contains enough text to test wrapping and pagination.");
        }
        System.out.println("=== END OF OUTPUT ===");
    }
}
