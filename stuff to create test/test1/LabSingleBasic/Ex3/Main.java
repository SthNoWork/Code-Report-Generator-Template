public class Main {
    public static void main(String[] args) {
        int[] numbers = {10, 20, 30, 40, 50};
        int product = 1;
        for (int num : numbers) {
            product *= num;
        }
        System.out.println("Product: " + product);
    }
}
