import java.io.File;
import java.io.FileNotFoundException;
import java.util.Scanner;

public class Main {
    public static void main(String[] args) throws FileNotFoundException {
        Scanner sc = new Scanner(new File("data.csv"));
        int count = 0;
        double sum = 0;
        
        while (sc.hasNextLine()) {
            String line = sc.nextLine();
            String[] parts = line.split(",");
            if (parts.length > 1) {
                sum += Double.parseDouble(parts[1]);
                count++;
            }
        }
        
        System.out.println("Average: " + (sum / count));
        sc.close();
    }
}
